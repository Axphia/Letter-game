# Discord Letter Game Bot 🎮🔤

A fully-featured, robust Discord bot for playing the classic English "Word Chain" (Start Letter) game in your server. The bot uses real-time dictionary validation, handles multiple games concurrently, and keeps your channels clean from incorrect guesses!

## ✨ Features
* **Real English Dictionary:** Checks words using an offline dictionary (`check-if-word`).
* **Multi-Channel / Multi-Server Support:** Independent game states are stored per-channel, meaning you can run 10 games in 10 different channels simultaneously without them interfering.
* **Auto-Clean Chat:** Incorrect guesses (wrong letter, not an English word, or already used) are automatically deleted, followed by an ephemeral warning that deletes itself after 3 seconds.
* **Race-Condition Proof:** Engineered with synchronous state updates to prevent breaking the chain if multiple users answer in the exact same millisecond.
* **Anti-Spam Rules:** A single player cannot answer twice in a row (unless playing in Solo Mode).
* **Solo Mode:** Start a game with `/start solo:True` to practice by yourself without consecutive player restrictions!

## 📜 Commands

* `/setup` **(Admin Only):** Automatically creates a dedicated `#word-game` channel with the correct bot permissions (View, Send, and Manage Messages) and @everyone permissions.
* `/start [solo: boolean]` **(Everyone):** Starts a new game and provides a random starting letter. Optionally enable solo mode.
* `/stop` **(Everyone):** Stops the current active game in the channel and announces the total score (words played).
* `/clear` **(Admin Only):** Clears up to 100 recent messages. Restricted to work only in an active game channel or a channel named `#word-game`.

## 🛠️ Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Axphia/Letter-game.git
   cd Letter-game
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure the environment variables:**
   - Create a file named `.env` in the root folder.
   - Add your bot token like this:
     ```env
     DISCORD_TOKEN=your_bot_token_here
     ```

4. **Enable Intents:**
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications).
   - Navigate to your Application -> **Bot** tab.
   - Scroll down to **Privileged Gateway Intents** and enable **MESSAGE CONTENT INTENT**.

5. **Start the bot:**
   ```bash
   node index.js
   ```

## 📝 Technologies Used
- Node.js
- `discord.js` v14
- `dotenv`
- `check-if-word`

---
*Created by [Axphia](https://github.com/Axphia)*