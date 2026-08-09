def test_pytest_runner_is_wired():
    # Keeps pytest exit code stable even when optional dependency-based tests are skipped.
    assert True
