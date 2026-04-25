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
