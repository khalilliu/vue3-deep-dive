let activeEffect;
const effectStack = [];
const bucket = new WeakMap();

function effect(fn, options = {}) {
  const effectFn = () => {
    cleanup(effectFn);
    activeEffect = effectFn;
    effectStack.push(effectFn);
    const res = fn();
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];
    return res;
  };
  effectFn.deps = [];
  effectFn.options = options;
  if (!options.lazy) {
    effectFn();
  }
  return effectFn;
}

function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    const deps = effectFn.deps[i];
    deps.delete(effectFn);
  }
  effectFn.deps.length = 0;
}

function track(target, key) {
  if (!activeEffect) return;
  let depsMap = bucket.get(target);
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()));
  }
  let deps = depsMap.get(key);
  if (!deps) {
    depsMap.set(key, (deps = new Set()));
  }
  deps.add(activeEffect);
  activeEffect.deps.push(deps);
}

function trigger(target, key) {
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  const effects = depsMap.get(key);
  const effectsToRun = new Set();
  effects.forEach((effectFn) => {
    if (effectFn != activeEffect) {
      effectsToRun.add(effectFn);
    }
  });
  effectsToRun &&
    effectsToRun.forEach((effectFn) => {
      if (effectFn.options.scheduler) {
        effectFn.options.scheduler(effectFn);
      } else {
        effectFn();
      }
    });
}

function computed(getter) {
  let value;
  let dirty = true;
  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      if (!dirty) {
        dirty = true;
        trigger(obj, 'value');
      }
    },
  });
  const obj = {
    get value() {
      if (dirty) {
        value = effectFn();
        dirty = false;
      }
      track(obj, 'value');
      return value;
    },
  };
  return obj;
}

function watch(source, cb, options = {}) {
  let getter;
  if (typeof source === 'function') {
    getter = source;
  } else {
    getter = () => traverse(source);
  }
  let oldValue, newValue;
  let cleanup;
  function onInvalidate(fn) {
    cleanup = fn;
  }
  const job = () => {
    newValue = effectFn();
    if (cleanup) {
      cleanup();
    }
    cb(oldValue, newValue, onInvalidate);
    oldValue = newValue;
  };
  const effectFn = effect(() => getter(), {
    lazy: true,
    scheduler: () => {
      if (options.flush === 'post') {
        const p = Promise.resolve();
        p.then(job);
      } else {
        job();
      }
    },
  });
  if (options.immediate) {
    job();
  } else {
    oldValue = effectFn();
  }
}

function traverse(value, seen = new Set()) {
  if (typeof value !== 'object' || value === null || seen.has(value)) return;
  seen.add(value);
  for (const k in value) {
    traverse(value[k], seen);
  }
  return value;
}

const data = { ok: true, text: 'hello world', num: 0, foo: 1, bar: 2 };

const obj = new Proxy(data, {
  get(target, key) {
    track(target, key);
    return target[key];
  },
  set(target, key, newVal) {
    target[key] = newVal;
    trigger(target, key);
  },
});

// job queue
const jobQueue = new Set();
const promiseObj = Promise.resolve();
let isFlushing = false;

function flushJob() {
  if (isFlushing) return;
  isFlushing = true;
  promiseObj
    .then(() => {
      jobQueue.forEach((job) => job());
    })
    .finally(() => {
      isFlushing = false;
    });
}

const effectFn = effect(
  () => {
    console.log(obj.num);
    document.body.innerHTML = obj.num;
  },
  {
    scheduler(fn) {
      jobQueue.add(fn);
      flushJob();
    },
  }
);

// effectFn();

// obj.num++;
// obj.num++;
// console.log('end ');

// const sumRes = computed(() => obj.foo + obj.bar);
// effect(() => console.log('sumRes', sumRes.value));

// obj.foo++;

let finalData;
watch(
  () => obj.foo,
  async (oldValue, newValue, onInvalidate) => {
    let expired = false;
    onInvalidate(() => (expired = true));
    const res = await fetch(
      'https://62a18a3bcd2e8da9b0f353cb.mockapi.io/api/v1/users'
    ).then((res) => res.json());
    if (!expired) {
      finalData = res[newValue];
    }
    console.log(`value change from ${oldValue} -> ${newValue}`);
    console.log(finalData);
  },
  {
    // immediate: true,
    // flush: 'post',
  }
);

obj.foo++;
setTimeout(() => {
  obj.foo++;
}, 200);
