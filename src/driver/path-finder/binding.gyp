{
	'target_defaults': {
		'default_configuration': 'Release',
		'configurations': {
			'Common': {
				'cflags_cc': [ '-std=c++14', '-g', '-Wall', '-Wextra' ],
				'cflags_cc!': [ '-fno-exceptions' ],
				'xcode_settings': {
					'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
					'GCC_GENERATE_DEBUGGING_SYMBOLS': 'YES',
					'CLANG_CXX_LANGUAGE_STANDARD': 'c++14',
				},
				'msvs_settings': {
					'VCCLCompilerTool': {
						'ExceptionHandling': '1',
					},
				},
				'conditions': [
					[ 'OS == "win"', { 'defines': [ 'NOMSG', 'NOMINMAX', 'WIN32_LEAN_AND_MEAN' ] } ],
				],
			},
			'Release': {
				'inherit_from': [ 'Common' ],
				'xcode_settings': {
					'GCC_OPTIMIZATION_LEVEL': '3',
				},
			},
			'Profile': {
				'inherit_from': [ 'Common' ],
				'cflags_cc': [ '-O3', '-fprofile-generate' ],
				'ldflags': [ '-fprofile-generate' ],
				'xcode_settings': {
					'GCC_OPTIMIZATION_LEVEL': '3',
					'OTHER_CPLUSPLUSFLAGS': [ '-fprofile-instr-generate=_clangprof.profraw' ],
					'OTHER_LDFLAGS': [ '-fprofile-instr-generate=_clangprof.profraw' ],
				},
			},
			'Optimized': {
				'inherit_from': [ 'Common' ],
				'cflags_cc': [
					'-O3',
					'-fprofile-use=build/Profile/obj.target/pf/src/pf.gcda',
					'-fprofile-use=build/Profile/obj.target/pf/src/main.gcda',
				],
				'xcode_settings': {
					'OTHER_CPLUSPLUSFLAGS': [ '-fprofile-use=../_clangprof.profdata' ],
				},
			},
		},
	},
	'targets': [
		{
			'target_name': 'pf',
			'include_dirs': [
				'<!(node -e "require(\'nan\')")',
				'<!(node -e "require(\'isolated-vm/include\')")',
			],
			'sources': [
				'main.cc',
				'pf.cc',
			],
		}, {
			'target_name': 'action_after_build',
			'type': 'none',
			'dependencies': [ 'pf' ],
			'copies': [ {
				'files': [ '<(PRODUCT_DIR)/pf.node' ],
				'destination': 'out/<!(node -e "console.log(process.arch + \'-\' + process.platform + \'-\' + process.version)")',
			} ],
		},
	],
}
