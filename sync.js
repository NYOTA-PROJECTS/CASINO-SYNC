const { Sequelize, Op } = require('sequelize');
const winston = require('winston');
const { combine, timestamp, label, printf } = winston.format;


// Configuration de winston pour écrire dans un fichier de log
const logFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

const logger = winston.createLogger({
  format: combine(
    label({ label: 'Synchronisation' }),
    timestamp(),
    logFormat
  ),
  transports: [
    new winston.transports.File({ filename: 'sync.log' })
  ]
});

const localConfig = require('./config/localConfig.json');
const onlineConfig = require('./config/onlineConfig.json');
const models = require('./models');


const syncData = async () => {
  const localDB = new Sequelize(localConfig);
  const onlineDB = new Sequelize(onlineConfig);

  try {
    // Synchronisation des modèles
    for (const modelName in models) {
      const Model = models[modelName](localDB, Sequelize);
      const OnlineModel = models[modelName](onlineDB, Sequelize);

      await Model.sync();
      await OnlineModel.sync();
    }

    // Synchronisation des données
    const tables = Object.keys(models);
    for (const table of tables) {
      const Model = models[table](localDB, Sequelize);
      const OnlineModel = models[table](onlineDB, Sequelize);

      const localEntries = await Model.findAll();
      for (const entry of localEntries) {
        const onlineEntry = await OnlineModel.findOne({ where: { id: entry.id } });

        if (!onlineEntry || onlineEntry.updatedAt < entry.updatedAt) {
          await OnlineModel.upsert(entry.toJSON());
        } else if (onlineEntry.updatedAt > entry.updatedAt) {
          await Model.upsert(onlineEntry.toJSON());
        }
      }
    }

    logger.info('Synchronisation terminée.');
  } catch (error) {
    logger.error(`Une erreur est survenue : ${error.message}`);
  }
};

// Exécute la synchronisation toutes les 5 minutes
setInterval(syncData, 5 * 60 * 1000);