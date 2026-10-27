import { readFileSync, readdirSync } from 'node:fs';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import type { Bindings } from '../src/bindings';

export function migrationStatements(number: number): string[] {
  const file = readdirSync('backend/migrations').find(file => file.startsWith(String(number).padStart(4, '0')))!;
  return unstable_splitSqlQuery(readFileSync(`backend/migrations/${file}`, 'utf8'));
}

export async function database(through = 7) {
  const proxy = await getPlatformProxy<Bindings>({
    configPath: 'backend/tests/wrangler.test.json', persist: false, remoteBindings: false, envFiles: [],
  });
  try {
    for (let number = 1; number <= through; number++) {
      await proxy.env.DB.batch(migrationStatements(number).map(sql => proxy.env.DB.prepare(sql)));
    }
    return proxy;
  } catch (error) {
    await proxy.dispose();
    throw error;
  }
}
