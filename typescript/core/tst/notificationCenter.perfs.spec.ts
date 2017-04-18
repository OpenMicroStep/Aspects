import {NotificationCenter, Notification} from '@openmicrostep/aspects';
import {assert} from 'chai';

function add10k() { // must be fast
  let c = new NotificationCenter();
  let obs = <Object[]>[];
  let i = 50;
  while (i-- > 0)
    obs.push({
        test() {}
    });

  i = 1 * 1e5;
  while (i-- > 0)
    c.addObserver(obs[i % 50], "test", `${i % 50}`, obs[i*i % 50]);
}

function add1k_rm1k() { // must be fast
  let c = new NotificationCenter();
  let obs = <Object[]>[];
  let i = 50;
  while (i-- > 0)
    obs.push({
        test() {}
    });

  i = 1 * 1e3;
  while (i-- > 0)
    c.addObserver(obs[i % 50], "test", `${i % 50}`, i % 3 === 0 ? undefined : obs[i*i % 50]);
  i = 1 * 1e3;
  while (i-- > 0)
    c.removeObserver(obs[i % 50], "test", obs[i*i % 50]);
}

function add1k_emit10k() { // must be fast
  let c = new NotificationCenter();
  let obs = <Object[]>[];
  let i = 50;
  while (i-- > 0)
    obs.push({
        test() {}
    });

  i = 1 * 1e3;
  while (i-- > 0)
    c.addObserver(obs[i % 50], "test", `${i % 50}`, i % 3 === 0 ? undefined : obs[i*i % 50]);
  i = 1 * 1e4;
  while (i-- > 0)
    c.postNotification({ name: "test", object: obs[i*i % 50] });
}

function add1k_emit10k_rm1k() { // must be fast
  let c = new NotificationCenter();
  let obs = <Object[]>[];
  let i = 50;
  while (i-- > 0)
    obs.push({
        test() {}
    });

  i = 1 * 1e4;
  while (i-- > 0) {
    if (i % 10 === 0)
        c.addObserver(obs[i % 50], "test", `${i % 50}`, i % 3 === 0 ? undefined : obs[i*i % 50]);
    c.postNotification({ name: "test", object: obs[i*i % 50] });
    if (i % 9 === 0)
        c.removeObserver(obs[i % 50], "test", obs[i*i % 50]);
  }
}

export const tests = { name: 'perfs', tests: [
  add10k,
  add1k_rm1k,
  add1k_emit10k,
  add1k_emit10k_rm1k
]};