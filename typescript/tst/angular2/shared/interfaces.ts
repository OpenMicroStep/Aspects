export const interfaces = {
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
    "public=": {
        "is": "farCategory",
        "giveMeANumber=":{"is":"method","type":{"arguments":<any[]>[],"return":"decimal"}},
        "pass=":{"is":"method","type":{"arguments": ["any"],"return":"any"}},
        "p0=":{"is":"method","type":{"arguments":<any[]>[],"return":"Person"}},
        "arr_p0_1=":{"is":"method","type":{"arguments":<any[]>[],"return":"Person"}},
        "methods":["=giveMeANumber", "=pass", "=p0", "=arr_p0_1"]
    },
    "farCategories": ["=public"],

    "server=":{"is":"aspect","categories":["=public"]},
    "client=":{"is":"aspect","categories":<string[]>[],"farCategories":["=public"]},
    "aspects":["=server","=client"]
    }
}
