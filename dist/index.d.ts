/**
 * Entry point for splice-bot GitHub Action.
 *
 * Handles two event types:
 * - pull_request_review_comment: Extract changes and create new PR
 * - pull_request (closed+merged): Notify original PR about spliced PR merge
 */
export {};
