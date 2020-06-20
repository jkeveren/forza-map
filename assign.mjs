// recursively overrides values of the target with non-undefined values from the source(s)

// only supports single source
const recursiveAssign = (target, source) => {
	for (const key of Object.keys(source)) {
		if (target[key] instanceof Object && source[key] instanceof Object) {
			recursiveAssign(target[key], source[key]);
		} else {
			target[key] = source[key];
		}
	}
	return target;
};

// supports "infinite" sources
export default (...items) => items.filter(item => item !== undefined).reduce((sum, current) => recursiveAssign(sum, current));
