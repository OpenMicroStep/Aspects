import { Entity, ControlCenter } from './index';

export abstract class Transport {
  abstract remoteCall<T>(to: Entity, method: string, args: any[]): Promise<T>;
  abstract register(definition: ControlCenter.Definition, localMethod: ControlCenter.Method, localImpl: (...args) => any);
}
