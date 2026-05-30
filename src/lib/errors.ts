export class SyncError extends Error {}

export const errAt = (file: string, line: number | null, msg: string): SyncError =>
	new SyncError(`${file}${line != null ? `:${line}` : ''} — ${msg}`);
