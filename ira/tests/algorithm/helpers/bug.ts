/*
 * Known-bug tests (xfail). A bug test states the CORRECT behavior and is expected
 * to fail until the engine is fixed; once it starts passing, vitest reports it so
 * the marker can be removed.
 *
 * SHOW_BUGS=1 runs them as ordinary tests so the actual failure messages can be
 * checked: an xfail must fail for the bug's reason, not because of a typo.
 */
import { it } from "vitest";

const show = !!process.env.SHOW_BUGS;
export const itBug = show ? it : it.fails;
