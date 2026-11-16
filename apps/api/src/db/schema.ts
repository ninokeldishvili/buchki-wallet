import { pgTable, primaryKey, text, timestamp, uuid, index } from 'drizzle-orm/pg-core'

/** A user is identified by their EVM address (the account that signs in). */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  evmAddress: text('evm_address').notNull().unique(), // lowercase
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

/** Public addresses of the user's other chains (derived from the same seed in the browser). */
export const userAddresses = pgTable('user_addresses', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  chain: text('chain').notNull(),
  address: text('address').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (t) => [primaryKey({ columns: [t.userId, t.chain] })])

/** Single-use sign-in challenges. The exact message is stored so verification can't be tricked into a different text. */
export const authNonces = pgTable('auth_nonces', {
  nonce: text('nonce').primaryKey(),
  address: text('address').notNull(), // lowercase
  message: text('message').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true })
}, (t) => [index('auth_nonces_expires_idx').on(t.expiresAt)])

/** Sessions: the cookie holds a random token, the DB stores only its SHA-256 hash. */
export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
}, (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)])
