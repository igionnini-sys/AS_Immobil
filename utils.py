def format_currency(value):
    return f"€{value:,.2f}"

def format_percentage(value, decimals=2):
    return f"{value:.{decimals}f}%"
