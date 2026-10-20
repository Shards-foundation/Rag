import { query, Membership, User } from "@lumina/db";
import { protectedProcedure, router } from "./trpc";

export const teamRouter = router({
  list: protectedProcedure.query(async ({ ctx }: any) => {
    const { rows } = await query<Membership & User>(`
      SELECT m.*, u.email, u.name 
      FROM "Membership" m
      JOIN "User" u ON m."userId" = u.id
      WHERE m."organizationId" = $1
    `, [ctx.organizationId]);
    
    return rows.map(row => ({
      ...row,
      user: { id: row.userId, email: row.email, name: row.name }
    }));
  })
});