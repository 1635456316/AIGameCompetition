/**
 * 极简状态机：每个状态实现 enter/update/exit/handleInput。
 * 不依赖第三方库，方便后续扩展。
 */
class StateMachine {
    constructor(owner) {
        this.owner = owner;
        this.states = new Map();
        this.currentName = null;
        this.current = null;
    }

    add(name, state) {
        state.name = name;
        this.states.set(name, state);
        return this;
    }

    is(name) {
        return this.currentName === name;
    }

    change(name, params) {
        if (!this.states.has(name)) {
            console.warn('[StateMachine] missing state:', name);
            return;
        }
        if (this.current && this.current.exit) {
            this.current.exit(this.owner);
        }
        this.currentName = name;
        this.current = this.states.get(name);
        if (this.current.enter) {
            this.current.enter(this.owner, params || {});
        }
    }

    update(time, delta) {
        if (this.current && this.current.update) {
            this.current.update(this.owner, time, delta);
        }
    }

    handleInput(input) {
        if (this.current && this.current.handleInput) {
            this.current.handleInput(this.owner, input);
        }
    }
}
