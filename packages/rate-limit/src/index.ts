export type {
  RateLimitExceededErrorArgs,
  RateLimitExceededErrorMeta,
  RateLimitInvalidOptionErrorArgs,
  RateLimitInvalidOptionErrorMeta,
} from "./errors.js";
export { RateLimitExceededError, RateLimitInvalidOptionError } from "./errors.js";

export type * from "./rate-limit.js";
export { default as RateLimit } from "./rate-limit.js";
