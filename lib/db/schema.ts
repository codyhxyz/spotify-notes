import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  userId: text("user_id").primaryKey(),
  acceptedEula: boolean("accepted_eula").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Spotify OAuth tokens, one row per user. These deliberately do NOT live in
// the session cookie: a cookie is a per-browser snapshot that only Auth.js can
// rewrite, so a token stored there goes stale an hour after sign-in and can't
// be refreshed by the API routes that actually use it. See lib/spotify.ts.
export const spotifyAccounts = pgTable("spotify_accounts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.userId, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notes = pgTable(
  "notes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    trackId: text("track_id").notNull(),
    note: text("note").notNull().default(""),
    // Denormalized Spotify track metadata. Nullable so old rows pre-dating
    // migration 002 can coexist; the app refreshes these on the next save.
    trackName: text("track_name"),
    artists: text("artists").array(),
    artistUrls: text("artist_urls").array(),
    imageUrl: text("image_url"),
    trackUrl: text("track_url"),
    albumUrl: text("album_url"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.trackId] }),
    index("notes_user_id_updated_at_idx").on(t.userId, t.updatedAt),
  ]
);
