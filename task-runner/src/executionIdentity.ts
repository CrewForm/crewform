// SPDX-License-Identifier: MIT
import {AsyncLocalStorage} from 'node:async_hooks';
export const executionIdentity=new AsyncLocalStorage<{jobId:string;attemptId:string}>();
