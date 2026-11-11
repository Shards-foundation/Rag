import { query } from "@lumina/db";
import type { Membership } from "@lumina/db";
import { protectedProcedure, router } from "./trpc";

type TeamRow = Membership & { email: string; name: string | null };

export const teamRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { rows } = await query<TeamRow>(
      `SELECT m.*, u.email, u.name
       FROM "Membership" m JOIN "User" u ON m."userId" = u.id
       WHERE m."organizationId" = $1 ORDER BY u.email`,
      [ctx.organizationId],
    );
    return rows.map((row) => ({
      ...row,
      user: { id: row.userId, email: row.email, name: row.name },
    }));
  }),
});
