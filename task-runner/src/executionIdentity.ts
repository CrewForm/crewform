// SPDX-License-Identifier: AGPL-3.0-or-later
import {AsyncLocalStorage} from 'node:async_hooks';
export const executionIdentity=new AsyncLocalStorage<{jobId:string;attemptId:string}>();
