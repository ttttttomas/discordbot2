require('dotenv').config();
const { Client, GatewayIntentBits, Partials  } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

const db = new sqlite3.Database('./voice_times.db');
const userJoinTimes = new Map();

client.once('ready', () => {
    console.log(`Conectado como ${client.user.tag}`);
    db.run(`CREATE TABLE IF NOT EXISTS voice_time (
        user_id TEXT PRIMARY KEY,
        total_seconds INTEGER
    )`);

    // Reiniciar datos cada semana (domingo a medianoche)
    cron.schedule('0 0 * * 0', () => {
        db.run('DELETE FROM voice_time', (err) => {
            if (err) return console.error(err);
            console.log('Se reiniciaron los tiempos de voz.');
        });
    });
});

client.on('voiceStateUpdate', (oldState, newState) => {
        console.log(`Evento de voz: ${newState.member.user.username}`);

    const userId = newState.id;
    console.log(`Usuario ${userId} cambió de estado de voz.`);
    // Usuario se une a un canal de voz
    if (!oldState.channelId && newState.channelId) {
        console.log(`Nuevo usuario ${userId} se une a un canal de voz.`);
        userJoinTimes.set(userId, Date.now());
    }

    // Usuario se va de un canal de voz
    if (oldState.channelId && !newState.channelId) {
        const joinTime = userJoinTimes.get(userId);
        if (!joinTime) return;

        const duration = Math.floor((Date.now() - joinTime) / 1000); // en segundos
        userJoinTimes.delete(userId);
        console.log(`Usuario ${userId} se va de un canal de voz.`);
        db.get('SELECT total_seconds FROM voice_time WHERE user_id = ?', [userId], (err, row) => {
            if (err) return console.error(err);

            const newTotal = row ? row.total_seconds + duration : duration;
            console.log(`Tiempo de voz actual: ${newTotal}s`);
            db.run(
                'INSERT OR REPLACE INTO voice_time (user_id, total_seconds) VALUES (?, ?)',
                [userId, newTotal]
            );
            console.log(`Se registraron ${duration}s de tiempo en voz para ${userId}.`);
        });
    }
});

client.on('messageCreate', async (message) => {
    if (message.content === '!voicetime') {
        db.all('SELECT user_id, total_seconds FROM voice_time ORDER BY total_seconds DESC', async (err, rows) => {
            if (err) {
                console.error(err);
                return message.channel.send('Hubo un error al obtener los datos.');
            }

            if (!rows.length) return message.channel.send('Aún no hay datos registrados.');

            let reply = '**Tiempos en voice esta semana:**\n';
            for (const row of rows) {
                try {
                    const user = await client.users.fetch(row.user_id);
                    const timeStr = formatTime(row.total_seconds);
                    reply += `**${user.username}**: ${timeStr}\n`;
                } catch {
                    // Usuario probablemente ya no está en el servidor
                    continue;
                }
            }

            message.channel.send(reply);
        });
    }
});

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    return `${seconds}s | ${minutes}m | ${hours}h | ${days}d`;
}

client.login(process.env.DISCORD_TOKEN);
