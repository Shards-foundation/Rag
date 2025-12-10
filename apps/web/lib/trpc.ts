import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../../apps/api/src/router';

export const trpc = createTRPCReact<AppRouter>();