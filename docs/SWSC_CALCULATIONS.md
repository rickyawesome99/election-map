# State Wave Sensitivity Coefficient Calculations

This document records the State Wave Sensitivity Coefficient (SWSC) calculation for all 50 states using statewide aggregate U.S. House margins from `houseDelegationHistory` and national U.S. House popular-vote margins from `popVoteData`.

## Method

Margins use a Democratic-positive convention:

```text
House margin = Democratic percentage - Republican percentage
Cycle swing = current-cycle margin - previous-cycle margin
Interval ratio = state cycle swing / national cycle swing
SWSC = average of the included interval ratios
```

To match the established Iowa calculation:

- State and national cycle swings are rounded to one decimal.
- Each interval ratio is rounded to two decimals.
- The final average is rounded to two decimals.
- An interval is excluded when the absolute national swing is below `1.0` point.

The national House margins and swings used are:

| Year | National D−R margin | Cycle swing |
|---:|---:|---:|
| 2016 | −1.0 | — |
| 2018 | +8.6 | +9.6 |
| 2020 | +3.1 | −5.5 |
| 2022 | −2.7 | −5.8 |
| 2024 | −2.5 | +0.2 |

Because the 2022→2024 national swing is only `+0.2`, that interval is excluded for every state.

## State calculations

Each interval cell shows:

```text
state swing ÷ national swing = interval ratio
```

| State | 2016→18 | 2018→20 | 2020→22 | 2022→24 | SWSC |
|---|---:|---:|---:|---:|---:|
| Alabama | +13.9 ÷ +9.6 = 1.45 | −21.5 ÷ −5.5 = 3.91 | −7.1 ÷ −5.8 = 1.22 | −2.0 ÷ +0.2 = excluded | **2.19** |
| Alaska | +7.7 ÷ +9.6 = 0.80 | −2.6 ÷ −5.5 = 0.47 | +19.1 ÷ −5.8 = −3.29 | −12.4 ÷ +0.2 = excluded | **−0.67** |
| Arizona | +11.2 ÷ +9.6 = 1.17 | −2.0 ÷ −5.5 = 0.36 | −13.3 ÷ −5.8 = 2.29 | +9.6 ÷ +0.2 = excluded | **1.27** |
| Arkansas | +33.4 ÷ +9.6 = 3.48 | −14.8 ÷ −5.5 = 2.69 | +5.8 ÷ −5.8 = −1.00 | +1.0 ÷ +0.2 = excluded | **1.72** |
| California | +3.7 ÷ +9.6 = 0.39 | −0.6 ÷ −5.5 = 0.11 | −5.5 ÷ −5.8 = 0.95 | −5.8 ÷ +0.2 = excluded | **0.48** |
| Colorado | +11.4 ÷ +9.6 = 1.19 | −1.0 ÷ −5.5 = 0.18 | +3.2 ÷ −5.8 = −0.55 | −1.0 ÷ +0.2 = excluded | **0.27** |
| Connecticut | −1.3 ÷ +9.6 = −0.14 | −2.0 ÷ −5.5 = 0.36 | −4.4 ÷ −5.8 = 0.76 | +3.3 ÷ +0.2 = excluded | **0.33** |
| Delaware | +14.3 ÷ +9.6 = 1.49 | −11.4 ÷ −5.5 = 2.07 | −4.9 ÷ −5.8 = 0.84 | +3.2 ÷ +0.2 = excluded | **1.47** |
| Florida | +3.2 ÷ +9.6 = 0.33 | +0.2 ÷ −5.5 = −0.04 | −13.6 ÷ −5.8 = 2.34 | +2.8 ÷ +0.2 = excluded | **0.88** |
| Georgia | +16.0 ÷ +9.6 = 1.67 | +2.5 ÷ −5.5 = −0.45 | −2.6 ÷ −5.8 = 0.45 | −0.4 ÷ +0.2 = excluded | **0.56** |
| Hawaii | −2.4 ÷ +9.6 = −0.25 | −15.9 ÷ −5.5 = 2.89 | +0.8 ÷ −5.8 = −0.14 | +4.6 ÷ +0.2 = excluded | **0.83** |
| Idaho | +8.0 ÷ +9.6 = 0.83 | −9.0 ÷ −5.5 = 1.64 | −0.7 ÷ −5.8 = 0.12 | −1.8 ÷ +0.2 = excluded | **0.86** |
| Illinois | +14.2 ÷ +9.6 = 1.48 | −6.1 ÷ −5.5 = 1.11 | −3.6 ÷ −5.8 = 0.62 | −6.6 ÷ +0.2 = excluded | **1.07** |
| Indiana | +3.7 ÷ +9.6 = 0.39 | −7.2 ÷ −5.5 = 1.31 | −3.0 ÷ −5.8 = 0.52 | +1.4 ÷ +0.2 = excluded | **0.74** |
| Iowa | +13.2 ÷ +9.6 = 1.38 | −9.7 ÷ −5.5 = 1.76 | −6.6 ÷ −5.8 = 1.14 | −0.7 ÷ +0.2 = excluded | **1.43** |
| Kansas | +22.7 ÷ +9.6 = 2.36 | −6.7 ÷ −5.5 = 1.22 | +1.7 ÷ −5.8 = −0.29 | −2.7 ÷ +0.2 = excluded | **1.10** |
| Kentucky | +20.9 ÷ +9.6 = 2.18 | −9.2 ÷ −5.5 = 1.67 | −1.9 ÷ −5.8 = 0.33 | −14.6 ÷ +0.2 = excluded | **1.39** |
| Louisiana | +17.7 ÷ +9.6 = 1.84 | −3.4 ÷ −5.5 = 0.62 | −17.4 ÷ −5.8 = 3.00 | +8.8 ÷ +0.2 = excluded | **1.82** |
| Maine | +11.0 ÷ +9.6 = 1.15 | +0.7 ÷ −5.5 = −0.13 | −4.7 ÷ −5.8 = 0.81 | +1.1 ÷ +0.2 = excluded | **0.61** |
| Maryland | +8.1 ÷ +9.6 = 0.84 | −3.1 ÷ −5.5 = 0.56 | +0.2 ÷ −5.8 = −0.03 | −1.3 ÷ +0.2 = excluded | **0.46** |
| Massachusetts | −3.5 ÷ +9.6 = −0.36 | −3.8 ÷ −5.5 = 0.69 | −11.7 ÷ −5.8 = 2.02 | +32.9 ÷ +0.2 = excluded | **0.78** |
| Michigan | +8.8 ÷ +9.6 = 0.92 | −6.4 ÷ −5.5 = 1.16 | +1.0 ÷ −5.8 = −0.17 | −3.1 ÷ +0.2 = excluded | **0.64** |
| Minnesota | +8.0 ÷ +9.6 = 0.83 | −9.0 ÷ −5.5 = 1.64 | −0.5 ÷ −5.8 = 0.09 | −1.1 ÷ +0.2 = excluded | **0.85** |
| Mississippi | +11.8 ÷ +9.6 = 1.23 | −23.7 ÷ −5.5 = 4.31 | +2.8 ÷ −5.8 = −0.48 | −11.1 ÷ +0.2 = excluded | **1.69** |
| Missouri | +7.8 ÷ +9.6 = 0.81 | −6.0 ÷ −5.5 = 1.09 | −2.2 ÷ −5.8 = 0.38 | +0.8 ÷ +0.2 = excluded | **0.76** |
| Montana | +11.0 ÷ +9.6 = 1.15 | −8.1 ÷ −5.5 = 1.47 | −5.8 ÷ −5.8 = 1.00 | −0.3 ÷ +0.2 = excluded | **1.21** |
| Nebraska | +18.6 ÷ +9.6 = 1.94 | −3.5 ÷ −5.5 = 0.64 | +0.5 ÷ −5.8 = −0.09 | −0.2 ÷ +0.2 = excluded | **0.83** |
| Nevada | +4.4 ÷ +9.6 = 0.46 | −3.0 ÷ −5.5 = 0.55 | −5.8 ÷ −5.8 = 1.00 | −7.7 ÷ +0.2 = excluded | **0.67** |
| New Hampshire | +8.1 ÷ +9.6 = 0.84 | −3.3 ÷ −5.5 = 0.60 | +2.3 ÷ −5.8 = −0.40 | −2.9 ÷ +0.2 = excluded | **0.35** |
| New Jersey | +13.2 ÷ +9.6 = 1.38 | −5.5 ÷ −5.5 = 1.00 | −5.9 ÷ −5.8 = 1.02 | −2.7 ÷ +0.2 = excluded | **1.13** |
| New Mexico | +8.1 ÷ +9.6 = 0.84 | −10.4 ÷ −5.5 = 1.89 | +0.4 ÷ −5.8 = −0.07 | 0.0 ÷ +0.2 = excluded | **0.89** |
| New York | +7.5 ÷ +9.6 = 0.78 | −10.4 ÷ −5.5 = 1.89 | −10.2 ÷ −5.8 = 1.76 | +1.4 ÷ +0.2 = excluded | **1.48** |
| North Carolina | +4.4 ÷ +9.6 = 0.46 | +2.7 ÷ −5.5 = −0.49 | −4.9 ÷ −5.8 = 0.84 | −5.7 ÷ +0.2 = excluded | **0.27** |
| North Dakota | +20.7 ÷ +9.6 = 2.16 | −16.8 ÷ −5.5 = 3.05 | −20.8 ÷ −5.8 = 3.59 | +23.3 ÷ +0.2 = excluded | **2.93** |
| Ohio | +11.4 ÷ +9.6 = 1.19 | −9.2 ÷ −5.5 = 1.67 | +1.1 ÷ −5.8 = −0.19 | −0.3 ÷ +0.2 = excluded | **0.89** |
| Oklahoma | +16.4 ÷ +9.6 = 1.71 | −11.0 ÷ −5.5 = 2.00 | +1.4 ÷ −5.8 = −0.24 | +1.1 ÷ +0.2 = excluded | **1.16** |
| Oregon | +3.9 ÷ +9.6 = 0.41 | −5.6 ÷ −5.5 = 1.02 | −5.4 ÷ −5.8 = 0.93 | +2.7 ÷ +0.2 = excluded | **0.79** |
| Pennsylvania | +18.5 ÷ +9.6 = 1.93 | −11.5 ÷ −5.5 = 2.09 | −3.9 ÷ −5.8 = 0.67 | +3.1 ÷ +0.2 = excluded | **1.56** |
| Rhode Island | +1.9 ÷ +9.6 = 0.20 | +11.3 ÷ −5.5 = −2.05 | −27.1 ÷ −5.8 = 4.67 | +8.8 ÷ +0.2 = excluded | **0.94** |
| South Carolina | +10.5 ÷ +9.6 = 1.09 | −3.5 ÷ −5.5 = 0.64 | −20.2 ÷ −5.8 = 3.48 | +12.7 ÷ +0.2 = excluded | **1.74** |
| South Dakota | +3.9 ÷ +9.6 = 0.41 | −56.7 ÷ −5.5 = 10.31 | +3.5 ÷ −5.8 = −0.60 | +33.3 ÷ +0.2 = excluded | **3.37** |
| Tennessee | +8.4 ÷ +9.6 = 0.88 | −0.3 ÷ −5.5 = 0.05 | −9.9 ÷ −5.8 = 1.71 | −0.7 ÷ +0.2 = excluded | **0.88** |
| Texas | +16.7 ÷ +9.6 = 1.74 | −5.8 ÷ −5.5 = 1.05 | −10.9 ÷ −5.8 = 1.88 | +2.1 ÷ +0.2 = excluded | **1.56** |
| Utah | +8.7 ÷ +9.6 = 0.91 | −2.5 ÷ −5.5 = 0.45 | −5.3 ÷ −5.8 = 0.91 | +0.7 ÷ +0.2 = excluded | **0.76** |
| Vermont | −40.2 ÷ +9.6 = −4.19 | −3.8 ÷ −5.5 = 0.69 | −4.9 ÷ −5.8 = 0.84 | −1.1 ÷ +0.2 = excluded | **−0.89** |
| Virginia | +13.4 ÷ +9.6 = 1.40 | −9.1 ÷ −5.5 = 1.65 | −1.1 ÷ −5.8 = 0.19 | +0.1 ÷ +0.2 = excluded | **1.08** |
| Washington | +22.2 ÷ +9.6 = 2.31 | −12.6 ÷ −5.5 = 2.29 | −4.0 ÷ −5.8 = 0.69 | −1.2 ÷ +0.2 = excluded | **1.76** |
| West Virginia | +14.4 ÷ +9.6 = 1.50 | −17.4 ÷ −5.5 = 3.16 | +0.7 ÷ −5.8 = −0.12 | −6.5 ÷ +0.2 = excluded | **1.51** |
| Wisconsin | +3.6 ÷ +9.6 = 0.38 | −10.5 ÷ −5.5 = 1.91 | −12.5 ÷ −5.8 = 2.16 | +12.4 ÷ +0.2 = excluded | **1.48** |
| Wyoming | −2.0 ÷ +9.6 = −0.21 | −9.6 ÷ −5.5 = 1.75 | −0.1 ÷ −5.8 = 0.02 | −4.5 ÷ +0.2 = excluded | **0.52** |

## Interpretation and limitations

- `1.00` means the state's aggregate House margin moved one-for-one with the national House margin.
- Values above `1.00` indicate greater sensitivity to national swings.
- Values between `0.00` and `1.00` indicate relative insulation.
- A negative result means the state's included movements were, on average, opposite the national movement.

These values are mechanical outputs of the ratio-average method. Extreme and negative values can be caused by uncontested races, small delegations, redistricting, candidate effects, or other state-specific changes. They have not been capped or manually adjusted.

The executable source of truth is `calculateStateSwsc` in `data/tplModelData.ts`.
