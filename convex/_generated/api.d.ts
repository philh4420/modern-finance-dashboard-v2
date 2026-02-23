/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as finance from "../finance.js";
import type * as financeMath from "../financeMath.js";
import type * as http from "../http.js";
import type * as lib_authz from "../lib/authz.js";
import type * as ops from "../ops.js";
import type * as phase2 from "../phase2.js";
import type * as privacy from "../privacy.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  finance: typeof finance;
  financeMath: typeof financeMath;
  http: typeof http;
  "lib/authz": typeof lib_authz;
  ops: typeof ops;
  phase2: typeof phase2;
  privacy: typeof privacy;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
