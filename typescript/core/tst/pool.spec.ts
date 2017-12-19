import { Pool } from '@openmicrostep/aspects';
import { assert } from 'chai';

async function instant_create(f) {
  let i = 0;
  test_pool(f, {
    create() {
      return Promise.resolve({ name: `i${++i}` });
    },
    destroy(r) {
      r.name += "destroyed";
    },
  });
}
async function small_create(f) {
  let i = 0;
  test_pool(f, {
    create() {
      return new Promise((resolve, reject) => {
        setTimeout(() => resolve({ name: `i${++i}` }), Math.random() * 0.1);
      });
    },
    destroy(r) {
      r.name += "destroyed";
    },
  });
}
async function test_pool(f, provider: Pool.Provider<{ name: string }>) {
  let pool = new Pool<{ name: string }>(provider, { min: 0, max: 2 });
  assert.strictEqual(pool.size(), 0);
  assert.strictEqual(pool.available(), 0);
  assert.strictEqual(pool.borrowed(), 0);
  assert.strictEqual(pool.pending(), 0);

  let r0 = await pool.acquire();
  assert.strictEqual(pool.size(), 1);
  assert.strictEqual(pool.available(), 0);
  assert.strictEqual(pool.borrowed(), 1);
  assert.strictEqual(pool.pending(), 0);

  let r1 = await pool.acquire();
  assert.strictEqual(pool.size(), 2);
  assert.strictEqual(pool.available(), 0);
  assert.strictEqual(pool.borrowed(), 2);
  assert.strictEqual(pool.pending(), 0);

  let r2_promise = pool.acquire();
  assert.strictEqual(pool.size(), 2);
  assert.strictEqual(pool.available(), 0);
  assert.strictEqual(pool.borrowed(), 2);
  assert.strictEqual(pool.pending(), 1);

  pool.release(r0);
  let r2 = await r2_promise;
  assert.strictEqual(pool.size(), 2);
  assert.strictEqual(pool.available(), 0);
  assert.strictEqual(pool.borrowed(), 2);
  assert.strictEqual(pool.pending(), 0);

  pool.release(r1);
  assert.strictEqual(pool.size(), 2);
  assert.strictEqual(pool.available(), 1);
  assert.strictEqual(pool.borrowed(), 1);
  assert.strictEqual(pool.pending(), 0);

  pool.release(r2);
  assert.strictEqual(pool.size(), 2);
  assert.strictEqual(pool.available(), 2);
  assert.strictEqual(pool.borrowed(), 0);
  assert.strictEqual(pool.pending(), 0);

  assert.throw(() => pool.release(r2), "resource is not owned & acquired by this pool");

  assert.strictEqual(await pool.scoped(async r => {
    assert.strictEqual(pool.size(), 2);
    assert.strictEqual(pool.available(), 1);
    assert.strictEqual(pool.borrowed(), 1);
    assert.strictEqual(pool.pending(), 0);

    assert.strictEqual(await pool.scoped(r => {
      assert.strictEqual(pool.size(), 2);
      assert.strictEqual(pool.available(), 0);
      assert.strictEqual(pool.borrowed(), 2);
      assert.strictEqual(pool.pending(), 0);
      return Promise.resolve("my_value2");
    }), "my_value2");

    return Promise.resolve("my_value");
  }), "my_value");
  assert.strictEqual(pool.size(), 2);
  assert.strictEqual(pool.available(), 2);
  assert.strictEqual(pool.borrowed(), 0);
  assert.strictEqual(pool.pending(), 0);

  pool.releaseAndDestroy(await pool.acquire());
  assert.strictEqual(pool.size(), 1);
  assert.strictEqual(pool.available(), 1);
  assert.strictEqual(pool.borrowed(), 0);
  assert.strictEqual(pool.pending(), 0);
  pool.releaseAndDestroy(await pool.acquire());
  assert.strictEqual(pool.size(), 0);
  assert.strictEqual(pool.available(), 0);
  assert.strictEqual(pool.borrowed(), 0);
  assert.strictEqual(pool.pending(), 0);
  pool.release(await pool.acquire());
  assert.strictEqual(pool.size(), 1);
  assert.strictEqual(pool.available(), 1);
  assert.strictEqual(pool.borrowed(), 0);
  assert.strictEqual(pool.pending(), 0);

  let r: Promise<{ name: string }>[] = [];
  r.push(pool.acquire());
  r.push(pool.acquire());
  r.push(pool.acquire());
  r.push(pool.acquire());
  r.push(pool.acquire());
  await r[0];
  await r[1];
  assert.strictEqual(pool.size(), 2);
  assert.strictEqual(pool.available(), 0);
  assert.strictEqual(pool.borrowed(), 2);
  assert.strictEqual(pool.pending(), 3);

  pool.releaseAndDestroy(await r[0]);
  pool.release(await r[1]);
  await r[2];
  await r[3];
  assert.strictEqual(pool.size(), 2);
  assert.strictEqual(pool.available(), 0);
  assert.strictEqual(pool.borrowed(), 2);
  assert.strictEqual(pool.pending(), 1);

  pool.close();
  try {
    await r[4];
    assert.fail(`must throw`);
  } catch (e) {
    assert.strictEqual(e.message, "pool closed");
  }
  assert.strictEqual(pool.size(), 2);
  assert.strictEqual(pool.available(), 0);
  assert.strictEqual(pool.borrowed(), 2);
  assert.strictEqual(pool.pending(), 0);

  pool.close(); // do nothing
  assert.strictEqual(pool.size(), 2);
  assert.strictEqual(pool.available(), 0);
  assert.strictEqual(pool.borrowed(), 2);
  assert.strictEqual(pool.pending(), 0);

  pool.release(await r[2]);
  pool.release(await r[3]);
  assert.strictEqual(pool.size(), 0);
  assert.strictEqual(pool.available(), 0);
  assert.strictEqual(pool.borrowed(), 0);
  assert.strictEqual(pool.pending(), 0);

  f.continue();
}

export const tests = {
  name: 'Pool', tests: [
    instant_create,
    small_create,
  ]
};
