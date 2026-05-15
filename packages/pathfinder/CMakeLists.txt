# CXX=/opt/homebrew/Cellar/llvm/22.1.0/bin/clang++ cmake -DCMAKE_MODULE_PATH="$(pnpm exec auto_js_cmake_include)" -G Ninja -B build && ninja -C build
message(STATUS "Cmake version: ${CMAKE_VERSION}")

# `import std` configuration (before project)
cmake_minimum_required(VERSION 4.0.0 FATAL_ERROR)
if (CMAKE_VERSION VERSION_GREATER_EQUAL "4.3.0")
	set(CMAKE_EXPERIMENTAL_CXX_IMPORT_STD "451f2fe2-a8a2-47c3-bc32-94786d8fc91b")
else()
	set(CMAKE_EXPERIMENTAL_CXX_IMPORT_STD "d0edc3af-4c50-42ea-a356-e2862fe7a444")
endif()
set(CMAKE_CXX_EXTENSIONS OFF)
if(LINUX)
	# https://github.com/llvm/llvm-project/issues/121709
	add_compile_definitions(_FORTIFY_SOURCE=0)
	add_compile_options(-Wno-macro-redefined)
endif()
add_compile_options(
	$<$<CXX_COMPILER_ID:Clang>:-Wno-include-angled-in-module-purview>
	$<$<CXX_COMPILER_ID:Clang>:-Wno-reserved-module-identifier>
)

# project & language settings
project(pathfinder LANGUAGES CXX)
set(CMAKE_CXX_MODULE_STD ON)
set(CMAKE_CXX_STANDARD 26)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
# if(NOT CMAKE_BUILD_TYPE STREQUAL Debug)
# 	set(CMAKE_COMPILE_WARNING_AS_ERROR ON)
# endif()

# important compilation settings
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
if(APPLE)
	set(CMAKE_LINKER_TYPE LLD)
	set(CMAKE_OSX_DEPLOYMENT_TARGET "13.3")
	set(CMAKE_SHARED_LINKER_FLAGS "-dynamiclib -undefined dynamic_lookup")
elseif(WIN32)
	add_compile_definitions(NOMINMAX NOMSG WIN32_LEAN_AND_MEAN)
endif()

# optimization settings
set(CMAKE_INTERPROCEDURAL_OPTIMIZATION TRUE)

# linker settings
set(CMAKE_LINKER_TYPE LLD)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
add_compile_options(-fdata-sections -ffunction-sections)
add_link_options(-Wl,--icf=all)
if(LINUX)
	# Not supported in ld64 [darwin], or lld-link [windows]
	add_link_options(-Wl,--gc-sections)
endif()

# clang & gcc diagnostic flags
if(CMAKE_CXX_COMPILER_ID STREQUAL Clang OR CMAKE_CXX_COMPILER_ID STREQUAL GNU)
	add_compile_options(-fdiagnostics-color -Wall -Wextra -Wpedantic)
	if(CMAKE_BUILD_TYPE STREQUAL Debug)
		# Soften common development warnings
		add_compile_options(
			-Wno-unused-but-set-variable
			-Wno-unused-local-typedef
			-Wno-unused-parameter
			-Wno-unused-result
		)
	endif()
endif()

# napi configuration
include(FindNpmPackage)
set(NAPI_VERSION 10)
find_package_from_npm(@auto_js/js)
find_package_from_npm(@auto_js/napi_exports)

# target
add_library(pathfinder SHARED)
set_target_properties(pathfinder PROPERTIES PREFIX "" SUFFIX ".node")
target_link_libraries(pathfinder PUBLIC auto_js nodejs utility_js)

# sources
target_sources(pathfinder
	PUBLIC FILE_SET CXX_MODULES FILES
		src/heap.cc
		src/open-closed.cc
		src/pf.h.cc
		src/position.cc
		src/room.cc
		src/utility.cc
	PRIVATE
		src/main.cc
		src/pf.cc
)

# nan
if(NOT DEFINED NAN_LOCATION)
	execute_process(COMMAND sh -c "node -e 'require(\"nan\")'" OUTPUT_STRIP_TRAILING_WHITESPACE OUTPUT_VARIABLE NAN_LOCATION RESULT_VARIABLE RESULT)
	if(NOT RESULT STREQUAL 0)
		message(FATAL_ERROR "Failed to find 'nan'")
	endif()
	set(NAN_LOCATION "${NAN_LOCATION}" CACHE STRING "")
	message(STATUS "Found 'nan' at ${NAN_LOCATION}")
endif()
target_include_directories(pathfinder SYSTEM PRIVATE "${NAN_LOCATION}")

# isolated-vm
if(NOT DEFINED ISOLATED_VM_LOCATION)
	execute_process(COMMAND sh -c "node -e 'require(\"isolated-vm/include\")'" OUTPUT_STRIP_TRAILING_WHITESPACE OUTPUT_VARIABLE ISOLATED_VM_LOCATION RESULT_VARIABLE RESULT)
	if(NOT RESULT STREQUAL 0)
		message(FATAL_ERROR "Failed to find 'isolated-vm'")
	endif()
	message(STATUS "Found 'isolated-vm' at ${ISOLATED_VM_LOCATION}")
	set(ISOLATED_VM_LOCATION "${ISOLATED_VM_LOCATION}" CACHE STRING "")
endif()
target_include_directories(pathfinder SYSTEM PRIVATE "${ISOLATED_VM_LOCATION}")

# copy to destination
if(NOT DEFINED TRIPLET)
	execute_process(COMMAND sh -c "node -e 'console.log(require(\"./module/triplet.js\"))'" OUTPUT_STRIP_TRAILING_WHITESPACE OUTPUT_VARIABLE TRIPLET RESULT_VARIABLE RESULT)
	if(NOT RESULT STREQUAL 0)
		message(FATAL_ERROR "Failed to get triplet")
	endif()
	set(TRIPLET "${TRIPLET}" CACHE STRING "")
endif()
add_custom_command(
	TARGET pathfinder POST_BUILD COMMAND ${CMAKE_COMMAND} -E copy
	"$<TARGET_FILE:pathfinder>"
	"${CMAKE_SOURCE_DIR}/module/node_modules/@xxscreeps/pathfinder-${TRIPLET}/pf.${TRIPLET}.node")
