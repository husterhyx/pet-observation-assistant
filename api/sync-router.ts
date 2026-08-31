import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { configureSync, getSyncStatus, runSync } from "./sync/client";

export const syncRouter = createRouter({
  status: publicQuery.query(() => getSyncStatus()),
  configure: publicQuery
    .input(z.object({ serverUrl: z.string().max(500), apiKey: z.string().max(500).optional() }))
    .mutation(({ input }) => configureSync(input.serverUrl, input.apiKey)),
  run: publicQuery.mutation(() => runSync()),
});
