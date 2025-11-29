<?php
namespace RandoChat;

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;

class Chat implements MessageComponentInterface {
    protected $clients;
    protected $users;
    protected $randomQueue;

    public function __construct() {
        $this->clients = new \SplObjectStorage;
        $this->users = [];
        $this->randomQueue = [];
    }

    public function onOpen(ConnectionInterface $conn) {
        // Store the new connection to send messages to later
        $this->clients->attach($conn);
        echo "New connection! ({$conn->resourceId})\n";
    }

    public function onMessage(ConnectionInterface $from, $msg) {
        $numRecv = count($this->clients) - 1;
        echo sprintf('Connection %d sending message "%s" to %d other connection%s' . "\n"
            , $from->resourceId, $msg, $numRecv, $numRecv == 1 ? '' : 's');

        $data = json_decode($msg, true);

        if ($data['type'] === 'login') {
            $this->users[$from->resourceId] = [
                'conn' => $from,
                'username' => $data['username'],
                'status' => 'available'
            ];
            $this->broadcastUserList();
        } elseif ($data['type'] === 'message') {
            // Send to specific user if target is set, otherwise broadcast (or handle random)
            if (isset($data['target'])) {
                $targetId = $data['target'];
                if (isset($this->users[$targetId])) {
                    $this->users[$targetId]['conn']->send(json_encode([
                        'type' => 'message',
                        'from' => $from->resourceId,
                        'username' => $this->users[$from->resourceId]['username'],
                        'message' => $data['message']
                    ]));
                }
            } else {
                // Broadcast to all (for now, or implement random pairing logic here)
                 foreach ($this->clients as $client) {
                    if ($from !== $client) {
                        // The sender is not the receiver, send to each client connected
                        $client->send($msg);
                    }
                }
            }
        } elseif ($data['type'] === 'request_connection') {
             $targetId = $data['target'];
             if (isset($this->users[$targetId])) {
                 $this->users[$targetId]['conn']->send(json_encode([
                     'type' => 'connection_request',
                     'from' => $from->resourceId,
                     'username' => $this->users[$from->resourceId]['username']
                 ]));
             }
        } elseif ($data['type'] === 'accept_connection') {
             $targetId = $data['target'];
             if (isset($this->users[$targetId])) {
                 // Check if acceptor (from) already has a partner
                 if (isset($this->users[$from->resourceId]['partner'])) {
                     $oldPartnerId = $this->users[$from->resourceId]['partner'];
                     echo "User {$from->resourceId} accepting new connection, disconnecting old partner {$oldPartnerId}\n";
                     if (isset($this->users[$oldPartnerId])) {
                         $this->users[$oldPartnerId]['conn']->send(json_encode([
                             'type' => 'partner_disconnected',
                             'username' => $this->users[$from->resourceId]['username']
                         ]));
                         unset($this->users[$oldPartnerId]['partner']);
                     }
                 }

                 // Check if requester (target) already has a partner (edge case)
                 if (isset($this->users[$targetId]['partner'])) {
                     $oldPartnerId = $this->users[$targetId]['partner'];
                     echo "Target user {$targetId} has old partner {$oldPartnerId}, disconnecting\n";
                     if (isset($this->users[$oldPartnerId])) {
                         $this->users[$oldPartnerId]['conn']->send(json_encode([
                             'type' => 'partner_disconnected',
                             'username' => $this->users[$targetId]['username']
                         ]));
                         unset($this->users[$oldPartnerId]['partner']);
                     }
                 }

                 // Set partners
                 $this->users[$from->resourceId]['partner'] = $targetId;
                 $this->users[$targetId]['partner'] = $from->resourceId;
                 
                 echo "Connected {$from->resourceId} and {$targetId}\n";

                 // Notify both users they are connected
                 $msg = json_encode(['type' => 'connected', 'with' => $from->resourceId, 'username' => $this->users[$from->resourceId]['username']]);
                 $this->users[$targetId]['conn']->send($msg);
                 
                 $msg = json_encode(['type' => 'connected', 'with' => $targetId, 'username' => $this->users[$targetId]['username']]);
                 $from->send($msg);
             }
        } elseif ($data['type'] === 'decline_connection') {
             $targetId = $data['target'];
             if (isset($this->users[$targetId])) {
                 $this->users[$targetId]['conn']->send(json_encode([
                     'type' => 'connection_declined',
                     'from' => $from->resourceId,
                     'username' => $this->users[$from->resourceId]['username']
                 ]));
             }
        } elseif ($data['type'] === 'leave_chat') {
             $targetId = $data['target'];
             // Only process if they are actually partners
             if (isset($this->users[$targetId]) && 
                 isset($this->users[$targetId]['partner']) && 
                 $this->users[$targetId]['partner'] == $from->resourceId) {
                 
                 $this->users[$targetId]['conn']->send(json_encode([
                     'type' => 'partner_left',
                     'username' => $this->users[$from->resourceId]['username']
                 ]));
                 // Unset partners
                 unset($this->users[$targetId]['partner']);
             }
             
             if (isset($this->users[$from->resourceId]['partner'])) {
                 unset($this->users[$from->resourceId]['partner']);
             }
        } elseif ($data['type'] === 'find_random') {
            // Prevent adding if already in queue
            if (in_array($from->resourceId, $this->randomQueue)) {
                return;
            }
            
            // Check if user already has a partner and disconnect them first
            if (isset($this->users[$from->resourceId]['partner'])) {
                 $oldPartnerId = $this->users[$from->resourceId]['partner'];
                 if (isset($this->users[$oldPartnerId])) {
                     $this->users[$oldPartnerId]['conn']->send(json_encode([
                         'type' => 'partner_disconnected',
                         'username' => $this->users[$from->resourceId]['username']
                     ]));
                     unset($this->users[$oldPartnerId]['partner']);
                 }
                 unset($this->users[$from->resourceId]['partner']);
            }

            // Check if anyone is waiting in the queue
            if (!empty($this->randomQueue)) {
                // Get the first waiting user
                $partnerId = array_shift($this->randomQueue);
                
                // Ensure the partner is still connected
                if (isset($this->users[$partnerId])) {
                    $partner = $this->users[$partnerId];
                    
                    // Set partners
                    $this->users[$from->resourceId]['partner'] = $partnerId;
                    $this->users[$partnerId]['partner'] = $from->resourceId;
                    
                    // Notify both users
                    $msg1 = json_encode(['type' => 'connected', 'with' => $from->resourceId, 'username' => $this->users[$from->resourceId]['username']]);
                    $partner['conn']->send($msg1);
                    
                    $msg2 = json_encode(['type' => 'connected', 'with' => $partnerId, 'username' => $partner['username']]);
                    $from->send($msg2);
                    
                    echo "Matched user {$from->resourceId} with {$partnerId}\n";
                } else {
                    // Partner disconnected, try again (recursive or just add to queue)
                    // For simplicity, just add current user to queue if partner failed
                    $this->randomQueue[] = $from->resourceId;
                    echo "Partner disconnected, added {$from->resourceId} to queue\n";
                }
            } else {
                // No one waiting, add to queue
                $this->randomQueue[] = $from->resourceId;
                echo "Added user {$from->resourceId} to random queue\n";
            }
        }
    }

    public function onClose(ConnectionInterface $conn) {
        // The connection is closed, remove it, as we can no longer send it messages
        $this->clients->detach($conn);
        
        if (isset($this->users[$conn->resourceId])) {
            $user = $this->users[$conn->resourceId];
            
            // Notify partner if they were chatting
            if (isset($user['partner']) && isset($this->users[$user['partner']])) {
                $partnerId = $user['partner'];
                $this->users[$partnerId]['conn']->send(json_encode([
                    'type' => 'partner_disconnected',
                    'username' => $user['username']
                ]));
                unset($this->users[$partnerId]['partner']);
            }

            unset($this->users[$conn->resourceId]);
            $this->broadcastUserList();
        }
        
        // Remove from random queue if present
        $key = array_search($conn->resourceId, $this->randomQueue);
        if ($key !== false) {
            unset($this->randomQueue[$key]);
            $this->randomQueue = array_values($this->randomQueue); // Reindex
        }
        
        echo "Connection {$conn->resourceId} has disconnected\n";
    }

    public function onError(ConnectionInterface $conn, \Exception $e) {
        echo "An error has occurred: {$e->getMessage()}\n";
        $conn->close();
    }

    protected function broadcastUserList() {
        $userList = [];
        foreach ($this->users as $id => $user) {
            $userList[] = [
                'id' => $id,
                'username' => $user['username'],
                'status' => $user['status']
            ];
        }
        $msg = json_encode(['type' => 'user_list', 'users' => $userList]);
        foreach ($this->clients as $client) {
            $client->send($msg);
        }
    }
}

