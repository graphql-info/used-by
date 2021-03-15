const { html } = require('@popeindustries/lit-html-server');
const path = require('path');

const getNamedType = (node) => {
    if (node.kind === 'NonNullType' || node.kind === 'ListType') {
        return getNamedType(node.type);
    }
    if (node.ofType) {
        return getNamedType(node.ofType);
    }
    return node;
};

const getDependencies = (astNode) => {
    let deps = [];
    if (Array.isArray(astNode.interfaces) && astNode.interfaces.length > 0) {
        deps = deps.concat(astNode.interfaces.map((i) => i.name.value));
    }

    if (Array.isArray(astNode.fields) && astNode.fields.length > 0) {
        astNode.fields.forEach((field) => {
            const type = getNamedType(field.type).name.value;
            deps.push(type);

            if (Array.isArray(field.directives) && field.directives.length > 0) {
                deps = deps.concat(field.directives.map((directive) => directive.name.value));
            }
        });
    }

    if (Array.isArray(astNode.types) && astNode.types.length > 0) {
        deps = deps.concat(astNode.types.map((type) => getNamedType(type).name.value));
    }

    if (Array.isArray(astNode.arguments) && astNode.arguments.length > 0) {
        deps = deps.concat(astNode.arguments.map((arg) => getNamedType(arg.type).name.value));
    }

    if (Array.isArray(astNode.directives) && astNode.directives.length > 0) {
        deps = deps.concat(astNode.directives.map((directive) => directive.name.value));
    }

    if (astNode.type) {
        deps.push(getNamedType(astNode.type).name.value);
    }

    return deps;
};

const requiredBy = new Map();

module.exports = {
    init: (target, schema) => {
        const types = schema.getTypeMap();
        Object.keys(types).forEach((name) => {
            if (name.startsWith('__')) {
                return;
            }
            const collectDeps = (fieldName, allTypes, currentType) => {
                if (fieldName === 'Query' || fieldName === 'Mutation' || fieldName === 'Subscription') {
                    allTypes[fieldName].astNode.fields.forEach((field) => {
                        getDependencies(field).forEach((item) => {
                            const deps = requiredBy.get(item) || [];
                            if (!deps.find((dep) => dep.name === field.name.value)) {
                                deps.push({ name: field.name.value, type: fieldName.toLowerCase() });
                            }
                            requiredBy.set(item, deps);
                        });
                    });
                } else {
                    getDependencies(allTypes[fieldName].astNode).forEach((item) => {
                        const deps = requiredBy.get(item) || [];
                        if (!deps.find((dep) => dep.name === fieldName)) {
                            deps.push({ name: fieldName, type: currentType });
                        }
                        requiredBy.set(item, deps);
                    });
                }
            };
            switch (types[name].constructor.name) {
                case 'GraphQLScalarType':
                case 'GraphQLEnumType':
                    return;
                case 'GraphQLObjectType':
                    collectDeps(name, types, 'object');
                    break;
                case 'GraphQLInterfaceType':
                    collectDeps(name, types, 'interface');
                    break;
                case 'GraphQLUnionType':
                    collectDeps(name, types, 'union');
                    break;
                case 'GraphQLInputObjectType':
                    collectDeps(name, types, 'input');
                    break;
                default:
                    break;
            }
        });
        return [{ name: 'css/badge.css', path: path.resolve(__dirname, './assets/css/badge.css') }];
    },
    render: (ref, schema, type, originalRenderer) => {
        const page = originalRenderer(ref, schema);
        const dependentBy = requiredBy.get(ref.name || ref.name.value);
        if (dependentBy) {
            page.push({
                name: 'usedBy',
                type: 'lit-html',
                value: html`
                    <section class='usedBy'>
                        <h3>Used By:</h3>
                        <ul>
                            ${dependentBy.map((item) => html`
                                <li>
                                    <a class='type' href='../${item.type}/${item.name}.html'>${item.name}</a><span class="badge">${item.type}</span>
                                </li>
                            `)}
                        </ul>
                    </section>
                `
            });
        }
        return page;
    }
};
