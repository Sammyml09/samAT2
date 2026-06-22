#!/bin/bash

# Install all dependencies for the Secure Software app
# This script activates the virtual environment and installs requirements

echo "Installing project dependencies..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install dependencies from requirements.txt
echo "Installing dependencies from requirements.txt..."
pip install -r requirements.txt

echo "✓ All dependencies installed successfully!"
echo "To activate the virtual environment, run: source venv/bin/activate"


