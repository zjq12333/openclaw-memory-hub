declare module "sql.js" {
	export interface SqlJsStatic {
		Database: new (data?: ArrayLike<number>) => Database
	}

	export interface Database {
		run(sql: string, params?: unknown[]): void
		exec(sql: string, params?: unknown[]): QueryExecResult[]
		export(): Uint8Array
		close(): void
	}

	export interface QueryExecResult {
		columns: string[]
		values: unknown[][]
	}

	export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>
}
