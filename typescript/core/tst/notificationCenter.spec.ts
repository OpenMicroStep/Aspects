import {NotificationCenter, Notification} from '@openmicrostep/aspects';
import {assert} from 'chai';
import {tests as tests_perfs} from './notificationCenter.perfs.spec';

function basics() {
    let c = new NotificationCenter();
    let obs = {
        methodNotification: undefined,
        method(this, notification) {
            this.methodNotification = notification;
        },

        method2Notification: undefined,
        method2(this, notification) {
            this.method2Notification = notification;
        },

        method3Notification: undefined,
        method3(this, notification) {
            this.method3Notification = notification;
        }
    };
    let sender = {
        emitTest0(this) {
            c.postNotification({
                name: "test2",
                object: this,
                info: { myInfo: "is working" }
            });
        },
        emitTest(this) {
            c.postNotification({
                name: "test",
                object: this,
                info: { myInfo: "is working" }
            });
        }
    };
    c.addObserver(obs, "method", "test", sender);
    c.addObserver(obs, "method2", "test", undefined);
    c.addObserver(obs, "method3", undefined, sender);
    sender.emitTest();
    assert.deepEqual(obs.methodNotification, { name: "test", object: sender, info: { myInfo: "is working" } });
    assert.deepEqual(obs.method2Notification, { name: "test", object: sender, info: { myInfo: "is working" } });
    assert.deepEqual(obs.method3Notification, { name: "test", object: sender, info: { myInfo: "is working" } });

    obs.methodNotification = undefined;
    obs.method2Notification = undefined;
    obs.method3Notification = undefined;
    sender.emitTest0();
    assert.isUndefined(obs.methodNotification);
    assert.isUndefined(obs.method2Notification);
    assert.deepEqual(obs.method3Notification, { name: "test2", object: sender, info: { myInfo: "is working" } });
    sender.emitTest();
    assert.deepEqual(obs.methodNotification, { name: "test", object: sender, info: { myInfo: "is working" } });
    assert.deepEqual(obs.method2Notification, { name: "test", object: sender, info: { myInfo: "is working" } });
    assert.deepEqual(obs.method3Notification, { name: "test", object: sender, info: { myInfo: "is working" } });
}

export const tests = { name: 'NotificationCenter', tests: [
  basics,
  tests_perfs
]};
