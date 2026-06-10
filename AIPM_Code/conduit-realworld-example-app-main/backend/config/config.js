/** @type {import('sequelize').Options} */
module.exports = {
  development: {
    dialect: process.env.DEV_DB_DIALECT || 'sqlite',
    storage: process.env.DEV_DB_STORAGE || './database_dev.sqlite',
    logging: process.env.DEV_DB_LOGGING === 'true',
  },
  test: {
    dialect: process.env.TEST_DB_DIALECT || 'sqlite',
    storage: process.env.TEST_DB_STORAGE || './database_test.sqlite',
    logging: process.env.TEST_DB_LOGGING === 'true',
  },
  production: {
    dialect: process.env.PROD_DB_DIALECT || 'sqlite',
    storage: process.env.PROD_DB_STORAGE || './database_prod.sqlite',
    logging: process.env.PROD_DB_LOGGING === 'true',
  },
};
