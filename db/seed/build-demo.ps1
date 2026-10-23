
$ErrorActionPreference = "Stop"

$source = Join-Path $PSScriptRoot "raw-export.sql"
$destination = Join-Path $PSScriptRoot "demo.sql"

$accountId = "467c3e2f-b656-4968-84f7-be1f2e84f3d4"
$originalPlanId = "33431c38-1c40-431f-9325-03488a6375f2"

if (-not (Test-Path $source)) {
    throw "raw-export.sql not found."
}

$lines = Get-Content -Path $source -Encoding UTF8

function Get-Inserts {
    param(
        [string]$Table
    )

    $prefix = "INSERT INTO public.$Table VALUES"

    return @(
        $lines | Where-Object {
            $_.StartsWith($prefix)
        }
    )
}

# --------------------------------------------------
# 1. Find the target company
# --------------------------------------------------

$account = @(
    Get-Inserts "accounts" | Where-Object {
        $_ -match [regex]::Escape($accountId)
    }
)

if ($account.Count -ne 1) {
    throw "Expected exactly one target account."
}

# --------------------------------------------------
# 2. Get predefined plans + company custom plans
# --------------------------------------------------

$allPlans = @(Get-Inserts "plans")

$plans = @(
    $allPlans | Where-Object {
        ($_ -match ", true\);$") -or
        ($_ -match [regex]::Escape($accountId))
    }
)

if ($plans.Count -eq 0) {
    throw "No plans found."
}

# --------------------------------------------------
# 3. Get company users
# --------------------------------------------------

$users = @(
    Get-Inserts "app_users" | Where-Object {
        $_ -match [regex]::Escape($accountId)
    }
)

# --------------------------------------------------
# 4. Get usage records
# --------------------------------------------------

$usage = @(
    Get-Inserts "usage_totals" | Where-Object {
        $_ -match [regex]::Escape($accountId)
    }
)

# --------------------------------------------------
# 5. Get request history
# --------------------------------------------------

$requests = @(
    Get-Inserts "requests" | Where-Object {
        $_ -match [regex]::Escape($accountId)
    }
)

# --------------------------------------------------
# 6. Handle circular foreign key
#
# accounts.plan_id -> plans.id
# plans.owner_account_id -> accounts.id
#
# Insert company with NULL plan first,
# then insert plans and restore its plan.
# --------------------------------------------------

$accountInsert = $account[0].Replace(
    "'$originalPlanId'",
    "NULL"
)

if ($accountInsert -eq $account[0]) {
    throw "Could not prepare account insert."
}

# --------------------------------------------------
# 7. Generate demo SQL
# --------------------------------------------------

$output = @(
    "-- Demo data for Usage Metering and Quota Service"
    "-- Company: API Key Test Company"
    "-- Includes predefined plans, custom plans,"
    "-- users, monthly usage, and request history."
    "-- Import into a fresh database after schema.sql."
    ""
    "BEGIN;"
    ""
    "-- Company"
    $accountInsert
    ""
    "-- Predefined and custom plans"
)

$output += $plans

$output += @(
    ""
    "-- Restore company's assigned plan"
    "UPDATE public.accounts SET plan_id = '$originalPlanId' WHERE id = '$accountId';"
    ""
    "-- Users"
)

$output += $users

$output += @(
    ""
    "-- Monthly usage"
)

$output += $usage

$output += @(
    ""
    "-- Request history"
)

$output += $requests

$output += @(
    ""
    "COMMIT;"
)

$output | Set-Content -Path $destination -Encoding utf8

# --------------------------------------------------
# 8. Summary
# --------------------------------------------------

Write-Host ""
Write-Host "Demo SQL created successfully!" -ForegroundColor Green
Write-Host "Created: $destination"
Write-Host "Accounts: $($account.Count)"
Write-Host "Plans: $($plans.Count)"
Write-Host "Users: $($users.Count)"
Write-Host "Usage records: $($usage.Count)"
Write-Host "Requests: $($requests.Count)"
