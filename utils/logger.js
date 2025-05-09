const { createLogger, format, transports } = require('winston');

const logger = createLogger({
    level: 'debug', // Default log level
    format: format.combine(
        format.colorize(), // Add colors to log levels
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Add timestamp
        format.printf(({ timestamp, level, message, ...meta }) => {
            const metaString = Object.keys(meta).length ? ` | Meta: ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${level}]: ${message}${metaString}`;
        })
    ),
    transports: [
        new transports.Console(), // Log to the console with colors
        new transports.File({
            filename: 'logs/app.log',
            format: format.combine(
                format.uncolorize(), // Remove colors for file logs
                format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaString = Object.keys(meta).length ? ` | Meta: ${JSON.stringify(meta)}` : '';
                    return `${timestamp} [${level.toUpperCase()}]: ${message}${metaString}`;
                })
            ),
        }), // Log to a file
    ],
});

module.exports = logger;