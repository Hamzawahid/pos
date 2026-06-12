import mysql from 'mysql2/promise'

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'prod_user',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pos_db',
  waitForConnections: true,
  connectionLimit: 20,
  timezone: '+00:00',
})
