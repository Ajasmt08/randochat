# RandoChat

RandoChat is a real-time anonymous chat application built with PHP and WebSockets (Ratchet). It allows users to join with a username, see other online users, request chats, or find a random partner.

## Features

-   **Real-time Messaging**: Instant message delivery using WebSockets.
-   **User Selection**: Choose a specific user to chat with from the online list.
-   **Random Chat**: Match with a random available user.
-   **Connection Requests**: Accept or decline chat requests.
-   **Responsive Design**: Works on desktop and mobile devices.

## Prerequisites

-   [PHP](https://www.php.net/downloads) (7.4 or higher recommended)
-   [Composer](https://getcomposer.org/download/)

## Installation

1.  Navigate to the project directory.
2.  Install the dependencies using Composer:

    ```bash
    composer install
    ```

## Usage

### 1. Start the WebSocket Server

Run the following command in your terminal to start the chat server:

```bash
php server.php
```

You should see the message: `Server started on port 8080`

### 2. Open the Client

Open the `index.html` file in your web browser. You can open it directly (e.g., double-click the file) or serve it using a local web server.

To open multiple clients for testing:
1.  Open `index.html` in one browser tab/window.
2.  Open `index.html` in another browser tab/window (or incognito mode).
3.  Enter different usernames and start chatting!

## Project Structure

-   `src/Chat.php`: Contains the WebSocket logic and event handlers.
-   `server.php`: The entry point script to start the Ratchet server.
-   `index.html`: The main frontend interface.
-   `script.js`: Handles client-side WebSocket connections and UI interactions.
-   `style.css`: Styles for the application.
-   `composer.json`: Project dependencies and configuration.

## Technologies Used

-   **Backend**: PHP, Ratchet (WebSocket library)
-   **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
