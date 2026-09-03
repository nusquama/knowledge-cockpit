#!/usr/bin/env python3
"""Compatibility entry point for the connected dashboard validator."""

from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).with_name('validate_connected.py')), run_name='__main__')
