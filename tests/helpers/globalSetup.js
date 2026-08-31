// helpers/globalSetup.js — create the test DB schema once before all tests.
//
// The schema is NOT hand-written any more: helpers/schema.sql is generated
// from the real production database (mysqldump --no-data). The previous
// hand-written copy had drifted from prod — it still had UNIQUE(email) where
// prod has UNIQUE(email, tenant_id), and lacked the consolidation tables —
// which let the 2026-08-31 duplicate-phone login lockout pass CI.
const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

module.exports = async function () {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'prod_user',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  })
  await conn.query('CREATE DATABASE IF NOT EXISTS pos_db_test')
  await conn.query('USE pos_db_test')
  const ddl = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  await conn.query('SET FOREIGN_KEY_CHECKS=0;\n' + ddl + '\nSET FOREIGN_KEY_CHECKS=1;')
  await conn.end()
  console.log('[test] pos_db_test schema ready (generated from prod schema)')
  process.env.TEST_DB = 'pos_db_test'
}
