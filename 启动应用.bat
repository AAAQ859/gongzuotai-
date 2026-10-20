@echo off
title Work Assistant
cd /d "%~dp0work-assistant"
echo Starting Work Assistant - first launch may take a few seconds...
call npm run dev
