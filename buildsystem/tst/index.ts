import {tests as parse_interface_tests} from './parse_interface.spec';
import {Test} from '@openmicrostep/tests';

export const name = 'aspects';
export const tests: Test<any>[] = [
  parse_interface_tests
];
