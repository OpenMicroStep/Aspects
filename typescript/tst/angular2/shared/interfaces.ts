export const interfaces = {
"DataSource=":
    {
    "is":"class",
    "core=":
        {
        "is":"category",
        "filter=": {"is":"filter","type":{"arguments":[[0, '*', 'VersionedObject'], 'dict'],"return": [0, '*', 'VersionedObject'] }},
        "methods":["=filter"]
        },
    "load=":
        {
        "is":"category",
        "query=":{"is":"method","type":{"arguments":['dict', [0, '*', 'string']],"return": [0, '*', 'VersionedObject']}},
        "load=":{"is":"method","type":{"arguments":[[0, '*', 'VersionedObject'], [0, '*', 'string']],"return": [0, '*', 'VersionedObject']}},
        "save=":{"is":"method","type":{"arguments":[[0, '*', 'VersionedObject']], "return": [0, '*', 'VersionedObject']}},
        "methods":["=query", "=load", "=save"]
        },
    "protected=":
        {
        "is":"category",
        "_query=":{"is":"method","type":{"arguments":[{ conditions: 'dict', scope: [0, '*', 'string']}],"return": [0, '*', 'VersionedObject']}},
        "_load=":{"is":"method","type":{"arguments":[{objects: [0, '*', 'VersionedObject'], scope: [0, '*', 'string']}],"return": [0, '*', 'VersionedObject']}},
        "_save=":{"is":"method","type":{"arguments":[[0, '*', 'VersionedObject']], "return": [0, '*', 'VersionedObject']}},
        "methods":["=_query", "=_load", "=_save"]
        },
    "categories":["=core"],
    "farCategories":["=load", "=protected"],

    "server=":{"is":"aspect","categories":["=core","=protected"]},
    "client=":{"is":"aspect","categories":["=core", "=load"],"farCategories":["=protected"]},
    "aspects":["=server","=client"]
    },
"Person=":
    {
    "is":"class",

    "_firstName=": {"is":"attribut", "type":"string"},
    "_lastName=":  {"is":"attribut", "type":"string"},
    "_birthDate=": {"is":"attribut", "type":"date"  },
    "attributes":["=_firstName","=_lastName","=_birthDate"],

    "core=":
        {
        "is":"category",
        "languages":["ts","objc"],
        "firstName=": {"is":"method","type":{"arguments":<any[]>[],"return":"string"}},
        "lastName=":  {"is":"method","type":{"arguments":<any[]>[],"return":"string"}},
        "fullName=":  {"is":"method","type":{"arguments":<any[]>[],"return":"string"}},
        "birthDate=": {"is":"method","type":{"arguments":<any[]>[],"return":"date"  }},
        "methods":["=firstName","=lastName","=fullName","=birthDate"]
        },
    "calculation=":
        {
        "is":"farCategory",
        "languages":["objc"],
        "age=":{"is":"method","type":{"arguments":<any[]>[],"return":"integer"}},
        "methods":["=age"]
        },
    "categories":["=core"],
    "farCategories":["=calculation"],

    "server=":{"is":"aspect","categories":["=core","=calculation"]},
    "client=":{"is":"aspect","categories":["=core"],"farCategories":["=calculation"]},
    "aspects":["=server","=client"]
    },
"DemoApp=":
    {
    "is":"class",

    "_dataSource=": {"is":"attribut", "type":"DataSource"},
    "attributes":["=_dataSource"],

    "core=": {
        "is": "category",
        "dataSource=":{"is":"method","type":{"arguments":<any[]>[],"return":"DataSource"}},
        "methods":["=dataSource"]
    },
    "public=": {
        "is": "farCategory",
        "giveMeANumber=":{"is":"method","type":{"arguments":<any[]>[],"return":"decimal"}},
        "pass=":{"is":"method","type":{"arguments": ["any"],"return":"any"}},
        "p0=":{"is":"method","type":{"arguments":<any[]>[],"return":"Person"}},
        "arr_p0_1=":{"is":"method","type":{"arguments":<any[]>[],"return":"Person"}},
        "methods":["=giveMeANumber", "=pass", "=p0", "=arr_p0_1"]
    },
    "farCategories": ["=public"],
    "categories": ["=core"],

    "server=":{"is":"aspect","categories":["=core", "=public"]},
    "client=":{"is":"aspect","categories":["=core"],"farCategories":["=public"]},
    "aspects":["=server","=client"]
    }
}
