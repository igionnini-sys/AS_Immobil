"""Acquisisce il comportamento Python esistente senza modificare l'app.

Eseguire dalla radice: python docs/migrazione/genera_baseline.py
Richiede NumPy e SciPy disponibili per il motore legacy.
Non sovrascrive una baseline già presente: usare --output con un altro percorso.
"""

import argparse
import hashlib
import json
import math
import platform
import sys
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.dont_write_bytecode = True

import numpy
import scipy
from calcoli import calculate_irr, calculate_real_estate_investment_improved


DEFAULTS = {
    "valore_immobile": 200000.0,
    "costo_acquisto": 0.0,
    "costo_ristrutturazione": 0.0,
    "affitto_lordo": 12000.0,
    "rivalutazione_annua": 2.0,
    "anni_investimento": 10,
    "commissione_iniziale": 0.0,
    "commissione_finale": 0.0,
    "costi_assicurazione_euro": 250.0,
    "costi_gestione_euro": 250.0,
    "manutenzione_straordinaria_perc": 1.0,
    "tassazione_affitti_perc": 21.0,
    "tassa_catastale_perc": 0.8,
    "rata_mutuo_mensile": 0.0,
    "anni_restanti_mutuo": 0,
    "periodo_sfitto_perc": 5.0,
    "inflazione_perc": 2.0,
    "tipo_adeguamento": "Valore Immobile",
    "adeguamento_affitto_anni": 4,
}

CASES = [
    ("default", {}),
    ("inflation_adjustment", {"tipo_adeguamento": "Inflazione"}),
    ("no_adjustment", {"tipo_adeguamento": "Nessun Adeguamento"}),
    ("actual_costs", {"costo_acquisto": 150000.0, "costo_ristrutturazione": 20000.0}),
    ("renovation_only", {"costo_ristrutturazione": 20000.0}),
    ("mortgage_ends_early", {"rata_mutuo_mensile": 500.0, "anni_restanti_mutuo": 5}),
    ("mortgage_zero_years", {"rata_mutuo_mensile": 500.0, "anni_restanti_mutuo": 0}),
    ("commissions_and_inflation", {"commissione_iniziale": 3000.0, "commissione_finale": 7000.0}),
    ("one_year", {"anni_investimento": 1}),
    ("zero_rent", {"affitto_lordo": 0.0}),
    ("full_vacancy", {"periodo_sfitto_perc": 100.0}),
    ("negative_terminal_capital", {"commissione_finale": 1000000.0}),
    ("invalid_zero_property", {"valore_immobile": 0.0}),
    ("invalid_zero_years", {"anni_investimento": 0}),
    ("invalid_zero_adjustment_interval", {"adeguamento_affitto_anni": 0}),
]


def normalize(value):
    """Rappresenta esplicitamente gli esiti legacy non serializzabili."""
    if isinstance(value, dict):
        return {key: normalize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalize(item) for item in value]
    if isinstance(value, complex):
        return {"legacyType": "complex", "real": value.real, "imag": value.imag}
    if isinstance(value, numpy.generic):
        return normalize(value.item())
    if isinstance(value, float) and not math.isfinite(value):
        return {"legacyType": "nonFinite", "value": str(value)}
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("baseline.json"))
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Il riferimento esiste già; usare --output con un nuovo percorso.")

    sources = sorted(ROOT.glob("*.py")) + [ROOT / "requirements.txt", ROOT / "README.md"]
    data = {
        "schemaVersion": 1,
        "referenceModel": "legacy-v1",
        "purpose": "Comportamento osservato, non certificazione delle formule",
        "environment": {
            "python": platform.python_version(),
            "numpy": numpy.__version__,
            "scipy": scipy.__version__,
        },
        "sourceSha256": {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in sources},
        "defaultParams": DEFAULTS,
        "cases": [],
        "irrDiagnostics": [],
    }
    for name, overrides in CASES:
        params = {**DEFAULTS, **overrides}
        case = {"id": name, "params": params}
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter("always")
            try:
                case["legacyResult"] = normalize(calculate_real_estate_investment_improved(params))
                case["status"] = "returned"
            except Exception as exc:
                case["status"] = "raised"
                case["legacyError"] = {"type": type(exc).__name__, "message": str(exc)}
            case["warnings"] = [str(item.message) for item in captured]
        data["cases"].append(case)

    for flows in ([-100, 110], [-100, 0, 121], [-100, 0], [100, 110], [-100, 230, -132]):
        rate = calculate_irr(flows)
        residual = sum(cf / (1 + rate) ** i for i, cf in enumerate(flows)) if rate is not None else None
        data["irrDiagnostics"].append(normalize({"cashFlows": flows, "legacyRateFraction": rate, "npvResidual": residual}))

    # Il controllo JSON vieta NaN/Infinity; la modalità x protegge riferimenti già esistenti.
    with args.output.open("x", encoding="utf-8", newline="\n") as target:
        json.dump(data, target, ensure_ascii=False, indent=2, allow_nan=False)
        target.write("\n")
    print(f"Baseline acquisita: {len(data['cases'])} scenari, {len(data['irrDiagnostics'])} casi TIR -> {args.output}")


if __name__ == "__main__":
    main()
