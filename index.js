require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const checkWord = require('check-if-word');
const words = checkWord('en');

const statsFile = path.join(__dirname, 'stats.json');
let userStats = {};
if (fs.existsSync(statsFile)) {
  try {
    userStats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
  } catch (err) {
    console.error('Failed to load stats.json:', err);
  }
}

function saveStats() {
  try {
    fs.writeFileSync(statsFile, JSON.stringify(userStats, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save stats.json:', err);
  }
}

const TIERS = [
  { name: 'Bronze', emoji: '🥉', color: 0xcd7f32, min: 0, max: 49 },
  { name: 'Silver', emoji: '🥈', color: 0xc0c0c0, min: 50, max: 149 },
  { name: 'Gold', emoji: '🥇', color: 0xffd700, min: 150, max: 299 },
  { name: 'Platinum', emoji: '💎', color: 0x00ced1, min: 300, max: 499 },
  { name: 'Diamond', emoji: '🔮', color: 0x9932cc, min: 500, max: 999 },
  { name: 'Master', emoji: '👑', color: 0xe67e22, min: 1000, max: 2499 },
  { name: 'Grandmaster', emoji: '⚡', color: 0xff0000, min: 2500, max: Infinity }
];

function getPlayerTier(points) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (points >= TIERS[i].min) {
      return {
        ...TIERS[i],
        nextTier: TIERS[i + 1] || null
      };
    }
  }
  return { ...TIERS[0], nextTier: TIERS[1] };
}

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
      name: 'tier',
      description: 'Check your or another player’s rank tier and points.',
      options: [
        {
          name: 'user',
          description: 'The player to check (default: yourself)',
          type: 6, // USER
          required: false
        }
      ]
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
      scores: new Map(),
      lastPlayerId: null,
      solo: isSolo
    });

    const rulesMsg = isSolo ? `You can answer as many times as you want (Solo Mode)!` : `You cannot answer twice in a row!`;
    await interaction.reply(`The **Word Chain Game** has started! ⛓️\n**Rules:**\n• You must type a **single English word** only (no spaces or phrases).\n• The word must start with the LAST letter of the previous word.\n• ${rulesMsg}\n\nThe starting letter is: **${currentLetter.toUpperCase()}**`);
  }

  if (interaction.commandName === 'stop') {
    const game = activeGames.get(interaction.channelId);
    if (game) {
      const totalWords = game.usedWords.size;
      const sortedScores = Array.from(game.scores.entries()).sort((a, b) => b[1] - a[1]);

      let summary = `🛑 **The game has ended!**\nTotal words played: **${totalWords}**\n\n`;

      if (sortedScores.length > 0) {
        summary += `🏆 **Scoreboard / Leaderboard:**\n`;
        const topScore = sortedScores[0][1];
        const winners = sortedScores.filter(s => s[1] === topScore);

        sortedScores.forEach(([userId, score], index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
          const playerPoints = userStats[userId]?.points || score;
          const tier = getPlayerTier(playerPoints);
          summary += `${medal} <@${userId}> [${tier.emoji} ${tier.name}]: **${score}** point${score > 1 ? 's' : ''}\n`;
        });

        if (winners.length === 1) {
          summary += `\n🎉 **Winner:** <@${winners[0][0]}> with **${topScore}** point${topScore > 1 ? 's' : ''}!`;
        } else {
          summary += `\n🤝 **It's a tie between:** ${winners.map(w => `<@${w[0]}>`).join(', ')} with **${topScore}** point${topScore > 1 ? 's' : ''}!`;
        }
      } else {
        summary += `No points were scored this round.`;
      }

      activeGames.delete(interaction.channelId);
      await interaction.reply(summary);
    } else {
      await interaction.reply({ content: 'No game is currently active in this channel.', ephemeral: true });
    }
  }

  if (interaction.commandName === 'tier') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const stats = userStats[targetUser.id] || { points: 0, wordsPlayed: 0 };
    const points = stats.points || 0;
    const currentTier = getPlayerTier(points);

    let progressText = '';
    if (currentTier.nextTier) {
      const currentLevelProgress = points - currentTier.min;
      const levelTotal = currentTier.nextTier.min - currentTier.min;
      const percent = Math.min(100, Math.floor((currentLevelProgress / levelTotal) * 100));
      const filledBars = Math.floor(percent / 10);
      const emptyBars = 10 - filledBars;
      const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
      progressText = `\`[${progressBar}]\` **${percent}%**\n(${points}/${currentTier.nextTier.min} pts — **${currentTier.nextTier.min - points}** more needed for ${currentTier.nextTier.emoji} **${currentTier.nextTier.name}**)`;
    } else {
      progressText = `👑 **Max Tier Reached!** You are at the top!`;
    }

    const tierOverview = TIERS.map(t => {
      const isCurrent = t.name === currentTier.name;
      const prefix = isCurrent ? '▶ ' : '  ';
      const range = t.max === Infinity ? `${t.min}+ pts` : `${t.min} - ${t.max} pts`;
      return `${prefix}${t.emoji} **${t.name}**: ${range}${isCurrent ? ' 📍' : ''}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Player Tier: ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setColor(currentTier.color)
      .addFields(
        { name: 'Current Tier', value: `${currentTier.emoji} **${currentTier.name}**`, inline: true },
        { name: 'Total Points', value: `⭐ **${points}** pts`, inline: true },
        { name: 'Words Answered', value: `📖 **${stats.wordsPlayed || 0}** words`, inline: true },
        { name: 'Next Tier Progress', value: progressText, inline: false },
        { name: '📜 Tier Milestones', value: tierOverview, inline: false }
      )
      .setFooter({ text: 'Answer valid words in game to earn points & rank up!' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
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

    // Check if the user typed multiple words (contains words separated by spaces like "nitrous oxide")
    if (/^[a-z]+(\s+[a-z]+)+$/.test(word)) {
      message.delete().catch(() => null);
      message.channel.send(`<@${message.author.id}>, only **single words** are allowed! Do not type phrases with spaces.`)
        .then(reply => setTimeout(() => reply.delete().catch(() => null), 3000));
      return;
    }

    // Ignore messages with non-alphabet characters or punctuation (assuming they are chatting)
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
    game.scores.set(message.author.id, (game.scores.get(message.author.id) || 0) + 1);

    // Update persistent user stats
    if (!userStats[message.author.id]) {
      userStats[message.author.id] = { points: 0, wordsPlayed: 0 };
    }
    userStats[message.author.id].points += 1;
    userStats[message.author.id].wordsPlayed += 1;
    saveStats();

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
