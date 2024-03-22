const winston = require('winston');
const fs = require('fs');
const path = require('path');
const { Sequelize, Op } = require('sequelize');
const localConfig = require('./config/localConfig.json');
const onlineConfig = require('./config/onlineConfig.json');
const models = require('./models');


// Créer le dossier logs s'il n'existe pas
const logsDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDirectory)) {
  fs.mkdirSync(logsDirectory);
}

// Configurer le logger Winston pour enregistrer les logs dans un fichier
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDirectory, 'synchronisation.log'),
      level: 'info'
    })
  ]
});

// Fonction pour enregistrer les logs dans le fichier
const logToFile = (level, message) => {
  logger.log({
    level,
    message
  });
};

const syncData = async () => {
  // Ajouter des logs pour indiquer le début de la synchronisation
  logToFile('info', 'Début de la synchronisation...');

  const localDB = new Sequelize(localConfig);
  const onlineDB = new Sequelize(onlineConfig);

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

  console.log('Synchronisation terminée.');
};

// Exécute la synchronisation toutes les 5 minutes
setInterval(syncData, 5 * 60 * 1000);