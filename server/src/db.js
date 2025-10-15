const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

const DEFAULT_MAX_CONNECTIONS = 10;

function resolveConfig() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    process.env.DB_URL ||
    process.env.DB_CONNECTION_STRING ||
    null;

  const baseConfig = {
    max: Number(process.env.DB_CONNECTION_LIMIT) || DEFAULT_MAX_CONNECTIONS,
  };

  if (connectionString) {
    const config = { ...baseConfig, connectionString };

    const sslEnabled =
      process.env.DB_SSL === "true" ||
      process.env.DB_USE_SSL === "true" ||
      /supabase\.co/.test(connectionString);

    if (sslEnabled) {
      config.ssl = {
        rejectUnauthorized: false,
      };
    }

    return config;
  }

  return {
    ...baseConfig,
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "postgres",
    ssl:
      process.env.DB_SSL === "true" || process.env.DB_USE_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  };
}

function normalizeConnectionString(raw) {
  if (!raw || typeof raw !== "string") {
    return raw;
  }

  try {
    new URL(raw);
    return raw;
  } catch (_error) {
    const encoded = raw.replace(/\[/g, "%5B").replace(/\]/g, "%5D");
    try {
      new URL(encoded);
      return encoded;
    } catch (innerError) {
      console.warn("Unable to normalize database connection string", innerError);
      return raw;
    }
  }
}

const pool = new Pool(
  (() => {
    const config = resolveConfig();
    if (config.connectionString) {
      return { ...config, connectionString: normalizeConnectionString(config.connectionString) };
    }
    return config;
  })()
);

function transformQuery(sql, params = []) {
  if (typeof sql !== "string" || sql.trim().length === 0) {
    throw new Error("SQL query must be a non-empty string");
  }

  const values = Array.isArray(params) ? params : [];

  let text = sql;
  let appendConflict = false;

  const insertIgnoreRegex = /\binsert\s+ignore\s+into\b/i;
  if (insertIgnoreRegex.test(text)) {
    text = text.replace(insertIgnoreRegex, "INSERT INTO");
    if (!/\bon\s+conflict\b/i.test(text)) {
      appendConflict = true;
    }
  }

  let index = 0;
  text = text.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });

  if (appendConflict) {
    text = `${text} ON CONFLICT DO NOTHING`;
  }

  return { text, values };
}

function buildMetadata(result) {
  const metadata = {
    rowCount: result.rowCount,
    affectedRows: result.rowCount,
    command: result.command,
  };

  if (result.command === "INSERT" && Array.isArray(result.rows)) {
    const firstRow = result.rows[0];
    if (firstRow && typeof firstRow === "object") {
      if (Object.prototype.hasOwnProperty.call(firstRow, "id")) {
        metadata.insertId = firstRow.id;
      } else {
        const keys = Object.keys(firstRow);
        if (keys.length > 0) {
          metadata.insertId = firstRow[keys[0]];
        }
      }
    }
  }

  return metadata;
}

async function execute(client, sql, params) {
  const { text, values } = transformQuery(sql, params);
  const result = await client.query(text, values);
  return [result.rows, buildMetadata(result)];
}

async function query(sql, params) {
  const client = await pool.connect();
  try {
    return await execute(client, sql, params);
  } finally {
    client.release();
  }
}

async function getConnection() {
  const client = await pool.connect();
  let inTransaction = false;

  return {
    query: (sql, params) => execute(client, sql, params),
    beginTransaction: async () => {
      if (!inTransaction) {
        await client.query("BEGIN");
        inTransaction = true;
      }
    },
    commit: async () => {
      if (inTransaction) {
        await client.query("COMMIT");
        inTransaction = false;
      }
    },
    rollback: async () => {
      if (inTransaction) {
        await client.query("ROLLBACK");
        inTransaction = false;
      }
    },
    release: () => {
      if (inTransaction) {
        client
          .query("ROLLBACK")
          .catch(() => undefined)
          .finally(() => {
            inTransaction = false;
            client.release();
          });
      } else {
        client.release();
      }
    },
  };
}

module.exports = {
  query,
  getConnection,
};
