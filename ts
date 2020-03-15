#!/bin/sh
exec node --harmony -r $(dirname "$0")/env.js "$@"
