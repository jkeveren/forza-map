// returns element using argument object as properties for element but with 'tagName' and 'parentElement' writable

// e.g. `createElement({parentElement: randomElement, tagName: 'input', type: 'button'})` would return an input button appended to `randomElement`

import assign from './assign.mjs';

const createElement = originalOptions => {
	// so properties can be deleted while preserving original object for reuse.
	const o = assign({}, originalOptions);
	if (!['string', 'undefined'].includes(typeof o.tagName)) {
		throw new Error('tagName must be of type string');
	}
	const element = document.createElement(o.tagName === undefined ? 'div' : o.tagName);
	if (o.parentElement !== undefined) {
		if (!(o.parentElement instanceof Element)) {
			throw new Error('parentElement must be of type Element');
		}
		o.parentElement.appendChild(element);
	}
	if (o.children !== undefined) {
		if (!(o.children instanceof Array)) {
			throw new Error('children must be of type Array');
		}
		for (let child of o.children) {
			if (typeof child !== 'object' || child === null) {
				throw new Error('children must be an Array of Object');
			}
			if (!(child instanceof Element)) {
				child = createElement(child);
			}
			element.appendChild(child);
		}
	}
	delete o.tagName;
	delete o.parentElement;
	delete o.children;
	assign(element, o);
	return element;
};

export default createElement;
