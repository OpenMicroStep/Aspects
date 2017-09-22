
const defaultPoolConfig = {
  max: 5,
  min: 0,
};

type Resource<T> = {
  t: T,
  usages: number,
}
type Queued<T> = {
  resolve(t: T),
  reject(reason?),
  time: number,
}

export class Pool<T> implements Pool.Protocol<T> {
  config: Pool.Config;
  private _open = true;
  private _counter = 0;
  private _queue: Queued<T>[] = [];
  private _acquiredResources: Map<T, Resource<T>>  = new Map();
  private _freeResources: Resource<T>[]  = [];
  constructor(private _provider: Pool.Provider<T>, config: Partial<Pool.Config> = defaultPoolConfig) {
    this.config = { ...defaultPoolConfig, ...config };
  }

  async scoped<P>(scope: (db: T) => Promise<P>, priority: number = 0) : Promise<P> {
    let db = await this.acquire(priority);
    return scope(db)
      .then(v => { this.release(db); return Promise.resolve(v); })
      .catch(v => { this.release(db); return Promise.reject(v); })
  }

  acquire(priority: number = 0) : Promise<T> {
    if (!this._open) return Promise.reject(new Error(`cannot acquire on closed pool`));

    if (this._freeResources.length) {
      let r = this._freeResources.pop()!;
      r.usages++;
      this._acquiredResources.set(r.t, r);
      return Promise.resolve(r.t);
    }
    else {
      return new Promise<T>((resolve, reject) => {
        this._queue.push({ resolve: resolve, reject: reject, time: Date.now() });
        if (this._counter < this.config.max) {
          this._counter++;
          this._provider.create()
            .then(t => this._dispatch({ t: t, usages: 0 }))
            .catch(() => this._counter--);
        }
      });
    }
  }

  close() {
    if (!this._open) return;

    this._open = false;
    this._queue.forEach(q => q.reject(new Error(`cannot acquire on closed pool`)));
    this._freeResources.forEach(r => this._destroy(r));
    this._queue = [];
    this._freeResources = [];
  }

  size() : number {
    return this._counter;
  }

  available() : number {
    return this._freeResources.length;
  }

  borrowed() : number {
    return this._acquiredResources.size;
  }

  pending() : number {
    return this._queue.length;
  }

  private _dispatch(r: Resource<T>) {
    if (!this._open) return this._destroy(r);

    if (this._provider.valid && !this._provider.valid(r.t)) {
      this._destroy(r);
    } else if (this._queue.length) {
      r.usages++;
      this._acquiredResources.set(r.t, r);
      this._queue.shift()!.resolve(r.t);
    }
    else {
      this._freeResources.push(r);
    }
  }

  private _release(t: T) : Resource<T> {
    let r = this._acquiredResources.get(t);
    if (!r)
      throw new Error(`released resource is not owned & acquired by this pool`);
    this._acquiredResources.delete(t);
    return r;
  }

  private _destroy(r: Resource<T>) {
    this._counter--;
    this._provider.destroy(r.t);
  }

  release(t: T) {
    this._dispatch(this._release(t));
  }

  releaseAndDestroy(t: T) {
    this._destroy(this._release(t));
  }
}

export namespace Pool {
  export interface Provider<T> {
    create(): Promise<T>;
    destroy(t: T): void;
    valid?(t: T): boolean
  }
  export interface Protocol<T> {
    acquire() : Promise<T>;
    release(t: T);
  }
  export type Config = {
    min: number;
    max: number;
  }
}
