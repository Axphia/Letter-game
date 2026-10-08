require('dotenv').config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const checkWord = require('check-if-word');
const words = checkWord('en');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const activeGames = new Map();

client.on('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Register slash commands globally
  const commands = [
    {
      name: 'setup',
      description: 'Creates a #word-game channel for the game.',
      default_member_permissions: PermissionFlagsBits.Administrator.toString()
    },
    {
      name: 'start',
      description: 'Starts a new word game.',
      options: [
        {
          name: 'solo',
          description: 'Enable solo mode (allows answering twice in a row)',
          type: 5, // BOOLEAN
          required: false
        }
      ]
    },
    {
      name: 'stop',
      description: 'Stops the current word game.',
    },
    {
      name: 'clear',
      description: 'Clears up to 100 recent messages in the channel.',
      default_member_permissions: PermissionFlagsBits.Administrator.toString()
    }
  ];

  try {
    await client.application.commands.set(commands);
    console.log('Slash commands registered successfully!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'setup') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You must be an Administrator to use this command.', ephemeral: true });
    }

    try {
      const channel = await interaction.guild.channels.create({
        name: 'word-game',
        type: 0, // GuildText
        topic: 'Play the English Start Letter Game here! Type /start to begin.',
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
          },
          {
            id: client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
          },
        ],
      });
      await interaction.reply(`Game channel created! Head over to <#${channel.id}> and type \`/start\` to play.`);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'I do not have permission to create channels!', ephemeral: true });
    }
  }

  if (interaction.commandName === 'start') {
    if (activeGames.has(interaction.channelId)) {
      return interaction.reply({ content: 'A game is already active in this channel!', ephemeral: true });
    }

    if (!interaction.guild.members.me.permissionsIn(interaction.channel).has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: 'Please grant me the **Manage Messages** permission in this channel so I can delete invalid words! (Or use `/setup` to let me create a proper channel automatically).', ephemeral: true });
    }

    const isSolo = interaction.options.getBoolean('solo') || false;
    const alphabet = "abcdefghiklmnoprstwy";
    const currentLetter = alphabet[Math.floor(Math.random() * alphabet.length)];

    activeGames.set(interaction.channelId, {
      active: true,
      currentLetter: currentLetter,
      usedWords: new Set(),
      lastPlayerId: null,
      solo: isSolo
    });

    const rulesMsg = isSolo ? `You can answer as many times as you want (Solo Mode)!` : `You cannot answer twice in a row!`;
    await interaction.reply(`The **Word Chain Game** has started! ⛓️\n**Rules:** You must type an English word that starts with the LAST letter of the previous word. ${rulesMsg}\n\nThe starting letter is: **${currentLetter.toUpperCase()}**`);
  }

  if (interaction.commandName === 'stop') {
    const game = activeGames.get(interaction.channelId);
    if (game) {
      const score = game.usedWords.size;
      activeGames.delete(interaction.channelId);
      await interaction.reply(`The game has been stopped in this channel. Total words played: **${score}**!`);
    } else {
      await interaction.reply({ content: 'No game is currently active in this channel.', ephemeral: true });
    }
  }

  if (interaction.commandName === 'clear') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You must be an Administrator to use this command.', ephemeral: true });
    }

    if (interaction.channel.name !== 'word-game' && !activeGames.has(interaction.channelId)) {
      return interaction.reply({ content: 'You can only use /clear in a game channel (e.g. #word-game).', ephemeral: true });
    }

    try {
      const messages = await interaction.channel.bulkDelete(100, true);
      await interaction.reply({ content: `Cleared ${messages.size} messages!`, ephemeral: true });
    } catch (error) {
      console.error('Error clearing messages:', error);
      await interaction.reply({ content: 'Failed to clear messages. Make sure I have "Manage Messages" permission and the messages are not older than 14 days.', ephemeral: true });
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const game = activeGames.get(message.channelId);

  if (game && game.active) {
    const word = message.content.trim().toLowerCase();

    // Ignore messages with spaces or non-alphabet characters (assuming they are just chatting)
    if (!/^[a-z]+$/.test(word)) return;

    // Evaluate all conditions synchronously
    if (!game.solo && game.lastPlayerId === message.author.id) {
      message.delete().catch(() => null);
      message.channel.send(`<@${message.author.id}>, you cannot answer twice in a row! Wait for someone else.`)
        .then(reply => setTimeout(() => reply.delete().catch(() => null), 3000));
      return;
    }

    if (!word.startsWith(game.currentLetter)) {
      message.delete().catch(() => null);
      message.channel.send(`<@${message.author.id}>, oops! The word must start with the letter **${game.currentLetter.toUpperCase()}**.`)
        .then(reply => setTimeout(() => reply.delete().catch(() => null), 3000));
      return;
    }

    if (!words.check(word)) {
      message.delete().catch(() => null);
      message.channel.send(`<@${message.author.id}>, **${word}** does not seem to be a valid English word!`)
        .then(reply => setTimeout(() => reply.delete().catch(() => null), 3000));
      return;
    }

    if (game.usedWords.has(word)) {
      message.delete().catch(() => null);
      message.channel.send(`<@${message.author.id}>, the word **${word}** has already been used! Try another one starting with **${game.currentLetter.toUpperCase()}**.`)
        .then(reply => setTimeout(() => reply.delete().catch(() => null), 3000));
      return;
    }

    // Success: Update the state synchronously to prevent race conditions from subsequent messages
    game.usedWords.add(word);
    game.currentLetter = word.charAt(word.length - 1);
    game.lastPlayerId = message.author.id;

    // Send the reply asynchronously
    message.reply(`Good job! The next word must start with **${game.currentLetter.toUpperCase()}**!`).catch(console.error);
  }
});

client.on('channelDelete', channel => {
  if (activeGames.has(channel.id)) {
    activeGames.delete(channel.id);
  }
});

client.login(process.env.DISCORD_TOKEN);
