# Referência: `build_formula_simple_eval` e validação de `statement`

Exemplo alinhado ao contrato atual de `formula.statement`: atribuição direta para `${field:id}`, sem variáveis intermediárias entre fórmulas.

```python
from datetime import date
from decimal import Decimal
from simpleeval import SimpleEval


def build_formula_simple_eval(names: dict[str, int]) -> SimpleEval:
    s = SimpleEval()

    # variáveis disponíveis na expressão
    s.names = names

    # funções permitidas
    s.functions = {
        "date": date,
        "abs": abs,
        "min": min,
        "max": max,
        "round": round,
        "Decimal": Decimal,
    }

    return s


if __name__ == "__main__":
    # Exemplo de expressão da RHS após mapeamento de tokens:
    # `${field:1} = ${field:2} + ${input:3}` -> `f_2 + i_3`
    evaluator = build_formula_simple_eval({"f_2": 10, "i_3": 5})
    result = evaluator.eval("f_2 + i_3")
    print("Resultado de dry-run:", result)
```
